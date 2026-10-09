// ✅ REGLER v2 — generisk Om/Gör/När-byggsats.
// Helt självförsörjande modul (egen Resend-klient, egna kalenderanrop)
// så den inte behöver ett dussin saker exporterade ur server.js — bara
// startRulesScheduler() anropas därifrån, en gång, efter att Firebase är
// initierat.
//
// Arkitektur: UPPTÄCKA och SKICKA är separata steg (se plan-filen för
// varför — korta: ett "skicka X minuter EFTER att Y hänt" kräver att vi
// kan upptäcka Y nu men skicka senare). Upptäckt skriver en post till
// `pendingSends` med en uträknad `sendAt`; en egen, oberoende tick
// skickar allt som förfallit. Det är den ENDA platsen resend.emails.send
// anropas från bakgrunden.
//
// Enda-instans-antagande: körs in-process med node-schedule. Om appen
// någon gång skalas till flera instanser är detta fortfarande KORREKT
// (idempotens-nyckeln i Firestore gör att bara en lyckas), bara onödigt
// dubbelarbete. Löses inte nu — se plan.
import schedule from 'node-schedule';
import { Resend } from 'resend';
import { getDirectAccessToken } from './token-refresh.js';
import {
  listAllTasksWithScheduledSlots,
  listActiveRulesByType,
  createPendingSend,
  listDuePendingSends,
  markPendingSendResult,
  appendRuleSendLog,
  getTemplate,
  getUserBookingPageSlug,
  listEventSnapshots,
  setEventSnapshot,
  deleteEventSnapshot
} from './firestore.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'BookR <noreply@onebookr.se>';
const MEETING_STARTS_WINDOW_MS = 5 * 60 * 1000;
const INVITE_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;

function substitutePlaceholders(str, vars) {
  if (!str) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] !== undefined ? String(vars[key]) : ''));
}

function formatStockholmTime(isoString) {
  try {
    return new Date(isoString).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return isoString;
  }
}

// Action-objektet { type: 'send_email', templateId, inlineEmail } lagras
// på regeln, men vid "skicka nu" finns ingen regel alls — båda vägarna
// pekar hit med samma lilla { email, templateId, inlineEmail }-form.
async function renderRuleEmail({ email, templateId, inlineEmail }, vars) {
  let subject, bodyHtml, bodyText;
  if (templateId) {
    const template = await getTemplate(email, templateId);
    if (!template) throw new Error(`Mallen ${templateId} finns inte längre`);
    ({ subject, bodyHtml, bodyText } = template);
  } else if (inlineEmail) {
    ({ subject, bodyHtml, bodyText } = inlineEmail);
  } else {
    throw new Error('Regeln saknar både mall och engångsmail');
  }
  const html = substitutePlaceholders(bodyHtml, vars);
  return {
    subject: substitutePlaceholders(subject, vars),
    html,
    text: substitutePlaceholders(bodyText, vars) || html?.replace(/<[^>]+>/g, '') || ''
  };
}

// Hämtar möten där token-ägaren själv är organisatör, med deltagarnas
// svarsstatus OCH skapad-tidpunkt (den senare behövs för negerade
// triggers — "har X INTE hänt inom Y minuter efter att inbjudan
// skapades").
async function fetchOrganizedMeetingsWithAttendees(accessToken, provider, timeMinISO, timeMaxISO) {
  if (provider === 'microsoft') {
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?` +
      `startDateTime=${encodeURIComponent(timeMinISO)}&endDateTime=${encodeURIComponent(timeMaxISO)}&` +
      `$select=id,subject,isCancelled,isOrganizer,createdDateTime,start,end,attendees&$top=50`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Prefer': 'outlook.timezone="UTC"' } });
    if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.value || [])
      .filter(e => !e.isCancelled && e.isOrganizer)
      .map(e => ({
        id: e.id,
        title: e.subject || 'Möte',
        created: e.createdDateTime,
        start: e.start?.dateTime ? (e.start.dateTime.includes('Z') ? e.start.dateTime : `${e.start.dateTime.split('.')[0]}Z`) : null,
        end: e.end?.dateTime ? (e.end.dateTime.includes('Z') ? e.end.dateTime : `${e.end.dateTime.split('.')[0]}Z`) : null,
        attendees: (e.attendees || []).map(a => ({
          email: a.emailAddress?.address,
          responseStatus: (a.status?.response || '').toLowerCase()
        }))
      }));
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(timeMinISO)}&timeMax=${encodeURIComponent(timeMaxISO)}&` +
    `singleEvents=true&orderBy=startTime&maxResults=50&showDeleted=false&` +
    `fields=items(id,summary,status,created,start,end,organizer(self),attendees(email,responseStatus))`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.items || [])
    .filter(e => e.status !== 'cancelled' && e.organizer?.self)
    .map(e => ({
      id: e.id,
      title: e.summary || 'Möte',
      created: e.created,
      start: e.start?.dateTime || null,
      end: e.end?.dateTime || null,
      attendees: (e.attendees || []).map(a => ({ email: a.email, responseStatus: a.responseStatus }))
    }));
}

// ✅ TRIGGER 1: meeting_starts (Task Manager-pass). Enda triggertypen som
// inte kräver Direktåtkomst — tiden finns redan i Firestore. `negate`
// stöds inte här (vad skulle "mötet INTE börjar" ens betyda?).
async function detectMeetingStarts() {
  const [tasks, rules] = await Promise.all([
    listAllTasksWithScheduledSlots(),
    listActiveRulesByType('meeting_starts')
  ]);
  if (tasks.length === 0 || rules.length === 0) return;

  const rulesByEmail = new Map();
  for (const rule of rules) {
    if (!rulesByEmail.has(rule.email)) rulesByEmail.set(rule.email, []);
    rulesByEmail.get(rule.email).push(rule);
  }

  const now = Date.now();

  for (const task of tasks) {
    const ownerRules = rulesByEmail.get(task.email);
    if (!ownerRules) continue;

    for (const slot of task.scheduledSlots) {
      if (!slot.eventId || !slot.start) continue;
      const slotStart = new Date(slot.start).getTime();
      if (Number.isNaN(slotStart)) continue;

      for (const rule of ownerRules) {
        const offsetMs = (Number(rule.offsetMinutes) || 0) * 60_000;
        const targetTime = slotStart + offsetMs;
        // Upptäcks inom nästa 5-minutersfönster — samma logik som v1,
        // bara att vi nu SCHEMALÄGGER istället för att skicka direkt.
        if (targetTime < now || targetTime >= now + MEETING_STARTS_WINDOW_MS) continue;

        const dedupeKey = `${slot.eventId}_${rule.id}`;
        await createPendingSend(dedupeKey, {
          email: task.email,
          ruleId: rule.id,
          recipientEmail: task.email,
          templateId: rule.action?.templateId || null,
          inlineEmail: rule.action?.inlineEmail || null,
          vars: { taskName: task.name || 'ditt arbetspass', meetingTime: formatStockholmTime(slot.start) },
          sendAt: new Date(targetTime),
          triggerReason: 'meeting_starts'
        });
      }
    }
  }
}

function describeTime(iso) {
  return iso ? formatStockholmTime(iso) : 'okänd tid';
}

// ✅ TRIGGER 2–5: invite_accepted / invite_declined / meeting_cancelled /
// meeting_rescheduled. Alla fyra bevakar HELA den Direktåtkomst-kopplade
// kalendern (Task Manager-pass har strukturellt aldrig deltagare), så de
// delar EN kalenderhämtning per ägare istället för en var.
async function detectCalendarTriggers() {
  const [acceptRules, declineRules, cancelledRules, rescheduledRules] = await Promise.all([
    listActiveRulesByType('invite_accepted'),
    listActiveRulesByType('invite_declined'),
    listActiveRulesByType('meeting_cancelled'),
    listActiveRulesByType('meeting_rescheduled')
  ]);
  const responseRules = [...acceptRules, ...declineRules];
  const changeRules = [...cancelledRules, ...rescheduledRules];
  if (responseRules.length === 0 && changeRules.length === 0) return;

  const rulesByEmail = new Map();
  for (const rule of [...responseRules, ...changeRules]) {
    if (!rulesByEmail.has(rule.email)) rulesByEmail.set(rule.email, []);
    rulesByEmail.get(rule.email).push(rule);
  }

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + INVITE_LOOKAHEAD_MS).toISOString();

  for (const [email, ownerRules] of rulesByEmail) {
    const ownerResponseRules = ownerRules.filter(r => r.triggerEvent === 'invite_accepted' || r.triggerEvent === 'invite_declined');
    const ownerChangeRules = ownerRules.filter(r => r.triggerEvent === 'meeting_cancelled' || r.triggerEvent === 'meeting_rescheduled');

    try {
      const tokenInfo = await getDirectAccessToken(email);
      if (!tokenInfo) continue; // ingen Direktåtkomst kopplad — inget att göra

      const events = await fetchOrganizedMeetingsWithAttendees(tokenInfo.accessToken, tokenInfo.provider, timeMin, timeMax);
      const bookingSlug = await getUserBookingPageSlug(email);

      if (ownerResponseRules.length > 0) {
        await detectInviteResponsesForOwner(email, events, ownerResponseRules, bookingSlug, now);
      }
      if (ownerChangeRules.length > 0) {
        await detectMeetingChangesForOwner(email, events, ownerChangeRules, now);
      }
    } catch (err) {
      console.error(`[Regler] Kunde inte kolla kalendern för ${email}:`, err.message);
    }
  }
}

async function detectInviteResponsesForOwner(email, events, ownerRules, bookingSlug, now) {
  for (const event of events) {
    const createdMs = event.created ? new Date(event.created).getTime() : null;

    for (const attendee of event.attendees) {
      // ✅ Organisatören listas ofta som sin egen deltagare (med
      // responseStatus "accepted") av Google/Microsoft — utan den här
      // spärren triggar en accept-regel ett "någon accepterade din
      // inbjudan"-mail TILL EN SJÄLV för ens egna möten.
      if (!attendee.email || attendee.email.toLowerCase() === email.toLowerCase()) continue;

      for (const rule of ownerRules) {
        const targetStatus = rule.triggerEvent === 'invite_accepted' ? 'accepted' : 'declined';
        const dedupeKey = `${event.id}_${attendee.email.toLowerCase()}_${rule.id}`;
        const vars = {
          meetingTitle: event.title,
          bookingLink: bookingSlug ? `https://www.onebookr.se/boka/${bookingSlug}` : ''
        };

        if (!rule.negate) {
          // Positiv trigger: "X har hänt" — skicka direkt eller med ett
          // tecknat offset ("efter" är det normala för en redan
          // inträffad händelse).
          if (attendee.responseStatus !== targetStatus) continue;
          const offsetMs = (Number(rule.offsetMinutes) || 0) * 60_000;
          await createPendingSend(dedupeKey, {
            email, ruleId: rule.id, recipientEmail: attendee.email,
            templateId: rule.action?.templateId || null,
            inlineEmail: rule.action?.inlineEmail || null,
            vars,
            sendAt: new Date(now.getTime() + offsetMs),
            triggerReason: rule.triggerEvent
          });
        } else {
          // Negerad trigger: "X har INTE hänt inom N minuter efter att
          // inbjudan skapades". Skickas till den som INTE svarat — en
          // nudge, inte ett meddelande till regelägaren.
          if (attendee.responseStatus === targetStatus) continue;
          if (!createdMs) continue;
          const deadlineMs = (Number(rule.deadlineMinutes) || 0) * 60_000;
          if (now.getTime() - createdMs < deadlineMs) continue;
          await createPendingSend(dedupeKey, {
            email, ruleId: rule.id, recipientEmail: attendee.email,
            templateId: rule.action?.templateId || null,
            inlineEmail: rule.action?.inlineEmail || null,
            vars,
            sendAt: now,
            triggerReason: `${rule.triggerEvent}_negated`
          });
        }
      }
    }
  }
}

// ✅ TRIGGER 4+5: meeting_cancelled / meeting_rescheduled. Upptäcks via
// en sparad ögonblicksbild (start/end) per möte — ingen provider ger ett
// pålitligt, enhetligt "det här avbokades nyss"-facit, men ALLA ger oss
// den aktuella listan, så en diff mot förra gången vi tittade räcker.
async function detectMeetingChangesForOwner(email, events, ownerRules, now) {
  const recipientsFor = (event) => event.attendees
    .map(a => a.email)
    .filter(e => e && e.toLowerCase() !== email.toLowerCase());

  const snapshots = await listEventSnapshots(email);
  const snapshotsById = new Map(snapshots.map(s => [s.eventId, s]));
  const seenIds = new Set();

  for (const event of events) {
    seenIds.add(event.id);
    if (!event.start || !event.end) continue;
    const previous = snapshotsById.get(event.id);

    if (!previous) {
      // Första gången vi ser mötet — inget att jämföra mot, bara spara.
      await setEventSnapshot(email, event.id, { start: event.start, end: event.end, title: event.title, attendees: recipientsFor(event) });
      continue;
    }

    if (previous.start !== event.start || previous.end !== event.end) {
      const rule = ownerRules.find(r => r.triggerEvent === 'meeting_rescheduled');
      if (rule) {
        const dedupeKey = `${event.id}_rescheduled_${rule.id}_${event.start}`;
        const vars = {
          meetingTitle: event.title,
          oldTime: describeTime(previous.start),
          newTime: describeTime(event.start)
        };
        for (const recipient of recipientsFor(event)) {
          await createPendingSend(`${dedupeKey}_${recipient.toLowerCase()}`, {
            email, ruleId: rule.id, recipientEmail: recipient,
            templateId: rule.action?.templateId || null,
            inlineEmail: rule.action?.inlineEmail || null,
            vars,
            sendAt: now,
            triggerReason: 'meeting_rescheduled'
          });
        }
      }
      await setEventSnapshot(email, event.id, { start: event.start, end: event.end, title: event.title, attendees: recipientsFor(event) });
    } else {
      // Oförändrat möte — håll deltagarlistan i snapshoten aktuell (om
      // någon lades till/togs bort utan att tiden ändrades).
      await setEventSnapshot(email, event.id, { ...previous, title: event.title, attendees: recipientsFor(event) });
    }
  }

  // Möten som fanns i förra ögonblicksbilden men saknas nu, och vars
  // starttid fortfarande låg i framtiden senast vi såg dem (annars har
  // de bara naturligt rullat ut ur sökfönstret eftersom de redan hänt).
  const cancelRule = ownerRules.find(r => r.triggerEvent === 'meeting_cancelled');
  for (const snap of snapshots) {
    if (seenIds.has(snap.eventId)) continue;
    const startMs = snap.start ? new Date(snap.start).getTime() : null;
    if (!startMs || startMs < now.getTime()) {
      await deleteEventSnapshot(email, snap.eventId);
      continue;
    }
    if (cancelRule) {
      const dedupeKey = `${snap.eventId}_cancelled_${cancelRule.id}`;
      const vars = { meetingTitle: snap.title || 'ett möte', oldTime: describeTime(snap.start) };
      for (const recipient of (snap.attendees || [])) {
        await createPendingSend(`${dedupeKey}_${recipient.toLowerCase()}`, {
          email, ruleId: cancelRule.id, recipientEmail: recipient,
          templateId: cancelRule.action?.templateId || null,
          inlineEmail: cancelRule.action?.inlineEmail || null,
          vars,
          sendAt: now,
          triggerReason: 'meeting_cancelled'
        });
      }
    }
    await deleteEventSnapshot(email, snap.eventId);
  }
}

// ✅ SKICKA: enda platsen som faktiskt mailar från bakgrundsjobbet.
async function flushPendingSends() {
  const due = await listDuePendingSends();
  for (const send of due) {
    try {
      const { subject, html, text } = await renderRuleEmail(send, send.vars || {});
      await resend.emails.send({ from: FROM_EMAIL, to: [send.recipientEmail], subject, html, text });
      await markPendingSendResult(send.id, 'sent');
      await appendRuleSendLog(send.email, {
        ruleId: send.ruleId, recipientEmail: send.recipientEmail, subject, status: 'sent', triggerReason: send.triggerReason
      });
    } catch (err) {
      console.error(`[Regler] Kunde inte skicka till ${send.recipientEmail}:`, err.message);
      await markPendingSendResult(send.id, 'failed', err.message);
    }
  }
}

export function startRulesScheduler() {
  schedule.scheduleJob('*/5 * * * *', () => {
    detectMeetingStarts().catch(err => console.error('[Regler] meeting_starts-körning kraschade:', err));
  });
  schedule.scheduleJob('* * * * *', () => {
    detectCalendarTriggers().catch(err => console.error('[Regler] Kalender-körning kraschade:', err));
  });
  schedule.scheduleJob('* * * * *', () => {
    flushPendingSends().catch(err => console.error('[Regler] Skicka-körning kraschade:', err));
  });
  console.log('✅ [Regler] Schemaläggare startad (meeting_starts var 5:e min, kalenderkoll + skicka var minut)');
}

// renderRuleEmail exporteras för "skicka nu"-endpointen i server.js
// (manuellt skick ska återanvända exakt samma mall-/platshållar-logik,
// inte duplicera den). Resten exporteras för att gå att köra enskilt
// vid felsökning/verifiering, utan att behöva starta hela cron-loopen.
export { renderRuleEmail, detectMeetingStarts, detectCalendarTriggers, flushPendingSends };

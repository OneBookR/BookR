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
  getUserBookingPageSlug
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
      `$select=id,subject,isCancelled,isOrganizer,createdDateTime,attendees&$top=50`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.value || [])
      .filter(e => !e.isCancelled && e.isOrganizer)
      .map(e => ({
        id: e.id,
        title: e.subject || 'Möte',
        created: e.createdDateTime,
        attendees: (e.attendees || []).map(a => ({
          email: a.emailAddress?.address,
          responseStatus: (a.status?.response || '').toLowerCase()
        }))
      }));
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(timeMinISO)}&timeMax=${encodeURIComponent(timeMaxISO)}&` +
    `singleEvents=true&orderBy=startTime&maxResults=50&showDeleted=false&` +
    `fields=items(id,summary,status,created,organizer(self),attendees(email,responseStatus))`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.items || [])
    .filter(e => e.status !== 'cancelled' && e.organizer?.self)
    .map(e => ({
      id: e.id,
      title: e.summary || 'Möte',
      created: e.created,
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

// ✅ TRIGGER 2+3: invite_accepted / invite_declined, båda med stöd för
// negate. Kräver Direktåtkomst (bevakar HELA kalendern — Task Manager-
// pass har strukturellt aldrig deltagare).
async function detectInviteResponses() {
  const [acceptRules, declineRules] = await Promise.all([
    listActiveRulesByType('invite_accepted'),
    listActiveRulesByType('invite_declined')
  ]);
  const rules = [...acceptRules, ...declineRules];
  if (rules.length === 0) return;

  const rulesByEmail = new Map();
  for (const rule of rules) {
    if (!rulesByEmail.has(rule.email)) rulesByEmail.set(rule.email, []);
    rulesByEmail.get(rule.email).push(rule);
  }

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + INVITE_LOOKAHEAD_MS).toISOString();

  for (const [email, ownerRules] of rulesByEmail) {
    try {
      const tokenInfo = await getDirectAccessToken(email);
      if (!tokenInfo) continue; // ingen Direktåtkomst kopplad — inget att göra

      const events = await fetchOrganizedMeetingsWithAttendees(tokenInfo.accessToken, tokenInfo.provider, timeMin, timeMax);
      const bookingSlug = await getUserBookingPageSlug(email);

      for (const event of events) {
        const createdMs = event.created ? new Date(event.created).getTime() : null;

        for (const attendee of event.attendees) {
          // ✅ Organisatören listas ofta som sin egen deltagare (med
          // responseStatus "accepted") av Google/Microsoft — utan den
          // här spärren triggar en accept-regel ett "någon accepterade
          // din inbjudan"-mail TILL EN SJÄLV för ens egna möten.
          if (!attendee.email || attendee.email.toLowerCase() === email.toLowerCase()) continue;

          for (const rule of ownerRules) {
            const targetStatus = rule.triggerEvent === 'invite_accepted' ? 'accepted' : 'declined';
            const dedupeKey = `${event.id}_${attendee.email.toLowerCase()}_${rule.id}`;
            const vars = {
              meetingTitle: event.title,
              bookingLink: bookingSlug ? `https://www.onebookr.se/boka/${bookingSlug}` : ''
            };

            if (!rule.negate) {
              // Positiv trigger: "X har hänt" — skicka direkt eller med
              // ett tecknat offset (minus skulle vara konstigt här, men
              // stöds — "efter" är det normala för en redan intraffad
              // händelse).
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
              // Negerad trigger: "X har INTE hänt inom N minuter efter
              // att inbjudan skapades". Skickas till den som INTE svarat
              // — en nudge, inte ett meddelande till regelägaren.
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
    } catch (err) {
      console.error(`[Regler] Kunde inte kolla inbjudningssvar för ${email}:`, err.message);
    }
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
    detectInviteResponses().catch(err => console.error('[Regler] invite-körning kraschade:', err));
  });
  schedule.scheduleJob('* * * * *', () => {
    flushPendingSends().catch(err => console.error('[Regler] Skicka-körning kraschade:', err));
  });
  console.log('✅ [Regler] Schemaläggare startad (meeting_starts var 5:e min, invite-koll + skicka var minut)');
}

// Exporteras bara för "skicka nu"-endpointen i server.js (manuellt skick
// ska återanvända exakt samma mall-/platshållar-logik, inte duplicera den).
export { renderRuleEmail };

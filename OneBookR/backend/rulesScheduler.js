// ✅ REGLER — bakgrundsjobb som kör automatiska mail-regler.
// Helt självförsörjande modul (egen Resend-klient, egna kalenderanrop)
// så den inte behöver ett dussin saker exporterade ur server.js — bara
// startRulesScheduler() anropas därifrån, en gång, efter att Firebase är
// initierat.
//
// Enda-instans-antagande: körs in-process med node-schedule. Om appen
// någon gång skalas till flera instanser är detta fortfarande KORREKT
// (idempotens-nyckeln i Firestore gör att bara en lyckas skicka), bara
// onödigt dubbelarbete. Löses inte nu — se plan.
import schedule from 'node-schedule';
import { Resend } from 'resend';
import { getDirectAccessToken } from './token-refresh.js';
import {
  listAllTasksWithScheduledSlots,
  listActiveRulesByType,
  tryClaimRuleRun,
  markRuleRunFailed,
  appendRuleSendLog,
  getTemplate,
  getUserBookingPageSlug
} from './firestore.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'BookR <noreply@onebookr.se>';
const REMINDER_WINDOW_MS = 5 * 60 * 1000;
const DECLINE_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;

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

async function renderRuleEmail(rule, vars) {
  let subject, bodyHtml, bodyText;
  if (rule.templateId) {
    const template = await getTemplate(rule.email, rule.templateId);
    if (!template) throw new Error(`Mallen ${rule.templateId} finns inte längre`);
    ({ subject, bodyHtml, bodyText } = template);
  } else if (rule.inlineEmail) {
    ({ subject, bodyHtml, bodyText } = rule.inlineEmail);
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
// svarsstatus — till skillnad från fetchUpcomingMeetingsWithDetails (som
// filtrerar bort events utan videolänk och aldrig returnerar attendees)
// behövs här just attendees/responseStatus för att upptäcka nekade svar.
async function fetchOrganizedMeetingsWithAttendees(accessToken, provider, timeMinISO, timeMaxISO) {
  if (provider === 'microsoft') {
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?` +
      `startDateTime=${encodeURIComponent(timeMinISO)}&endDateTime=${encodeURIComponent(timeMaxISO)}&` +
      `$select=id,subject,isCancelled,isOrganizer,attendees&$top=50`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.value || [])
      .filter(e => !e.isCancelled && e.isOrganizer)
      .map(e => ({
        id: e.id,
        title: e.subject || 'Möte',
        attendees: (e.attendees || []).map(a => ({
          email: a.emailAddress?.address,
          responseStatus: (a.status?.response || '').toLowerCase()
        }))
      }));
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(timeMinISO)}&timeMax=${encodeURIComponent(timeMaxISO)}&` +
    `singleEvents=true&orderBy=startTime&maxResults=50&showDeleted=false&` +
    `fields=items(id,summary,status,organizer(self),attendees(email,responseStatus))`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.items || [])
    .filter(e => e.status !== 'cancelled' && e.organizer?.self)
    .map(e => ({
      id: e.id,
      title: e.summary || 'Möte',
      attendees: (e.attendees || []).map(a => ({ email: a.email, responseStatus: a.responseStatus }))
    }));
}

// ✅ Påminnelse X minuter innan ett Task Manager-pass — kräver ingen
// kalenderkoppling, tiden finns redan i Firestore (scheduledSlots).
async function checkReminders() {
  const [tasks, rules] = await Promise.all([
    listAllTasksWithScheduledSlots(),
    listActiveRulesByType('reminder_before_meeting')
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
        const targetTime = slotStart - offsetMs;
        if (targetTime < now || targetTime >= now + REMINDER_WINDOW_MS) continue;

        const dedupeKey = `${slot.eventId}_${rule.id}`;
        const claimed = await tryClaimRuleRun(task.email, dedupeKey, {
          ruleId: rule.id,
          recipientEmail: task.email,
          status: 'sent'
        });
        if (!claimed) continue;

        try {
          const vars = { taskName: task.name || 'ditt arbetspass', meetingTime: formatStockholmTime(slot.start) };
          const { subject, html, text } = await renderRuleEmail(rule, vars);
          await resend.emails.send({ from: FROM_EMAIL, to: [task.email], subject, html, text });
          await appendRuleSendLog(task.email, { ruleId: rule.id, recipientEmail: task.email, subject, status: 'sent', triggerReason: 'reminder_before_meeting' });
        } catch (sendErr) {
          console.error(`[Regler] Kunde inte skicka påminnelse för ${task.email}:`, sendErr.message);
          await markRuleRunFailed(task.email, dedupeKey, sendErr.message);
        }
      }
    }
  }
}

// ✅ Neka-uppföljning — bevakar HELA den Direktåtkomst-kopplade kalendern
// (Task Manager-pass har strukturellt aldrig deltagare, så den kan aldrig
// trigga denna regel). Hoppar tyst över användare utan kopplad kalender.
async function checkDeclines() {
  const rules = await listActiveRulesByType('decline_followup');
  if (rules.length === 0) return;

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + DECLINE_LOOKAHEAD_MS).toISOString();

  for (const rule of rules) {
    try {
      const tokenInfo = await getDirectAccessToken(rule.email);
      if (!tokenInfo) continue; // ingen Direktåtkomst kopplad — inget att göra

      const events = await fetchOrganizedMeetingsWithAttendees(tokenInfo.accessToken, tokenInfo.provider, timeMin, timeMax);
      const bookingSlug = await getUserBookingPageSlug(rule.email);

      for (const event of events) {
        for (const attendee of event.attendees) {
          if (!attendee.email || attendee.responseStatus !== 'declined') continue;

          const dedupeKey = `${event.id}_${attendee.email.toLowerCase()}_${rule.id}`;
          const claimed = await tryClaimRuleRun(rule.email, dedupeKey, {
            ruleId: rule.id,
            recipientEmail: attendee.email,
            status: 'sent'
          });
          if (!claimed) continue;

          try {
            const vars = {
              meetingTitle: event.title,
              bookingLink: bookingSlug ? `https://www.onebookr.se/boka/${bookingSlug}` : ''
            };
            const { subject, html, text } = await renderRuleEmail(rule, vars);
            await resend.emails.send({ from: FROM_EMAIL, to: [attendee.email], subject, html, text });
            await appendRuleSendLog(rule.email, { ruleId: rule.id, recipientEmail: attendee.email, subject, status: 'sent', triggerReason: 'decline_followup' });
          } catch (sendErr) {
            console.error(`[Regler] Kunde inte skicka neka-uppföljning för ${rule.email}:`, sendErr.message);
            await markRuleRunFailed(rule.email, dedupeKey, sendErr.message);
          }
        }
      }
    } catch (err) {
      console.error(`[Regler] Neka-koll misslyckades för ${rule.email}:`, err.message);
    }
  }
}

export function startRulesScheduler() {
  schedule.scheduleJob('*/5 * * * *', () => {
    checkReminders().catch(err => console.error('[Regler] Påminnelse-körning kraschade:', err));
  });
  // ✅ Var minut, inte var 15:e — en nekad inbjudan ska kännas som att
  // BookR reagerar "direkt", inte efter en kaffepaus. Riktig realtid
  // (Google/Microsoft webhooks) är en större, separat sak (ny publik
  // endpoint, kanal-förnyelse, verifiering) — medvetet inte byggt nu.
  schedule.scheduleJob('* * * * *', () => {
    checkDeclines().catch(err => console.error('[Regler] Neka-körning kraschade:', err));
  });
  console.log('✅ [Regler] Schemaläggare startad (påminnelser var 5:e min, neka-koll var minut)');
}

// Exporteras bara för "skicka nu"-endpointen i server.js (manuellt skick
// ska återanvända exakt samma mall-/platshållar-logik, inte duplicera den).
export { renderRuleEmail, resend, FROM_EMAIL };

// ✅ RÖSTASSISTENT — text/röststyrda kommandon ("Avboka alla möten
// idag", "Boka om mötet med Peter till nästa vecka", "Skicka ett mail
// till Anders att jag blir 5 min sen", "Vilka har jag möte med idag?").
//
// Helt självförsörjande modul, egen Resend-klient och egna kalender-
// mutationer — importerar INTE från server.js (server.js är
// entrypointen och startar Express/app.listen vid import, så en
// cirkulär import därifrån hade startat en andra serverinstans).
// Återanvänder bara den redan existerande, testade
// `fetchOrganizedMeetingsWithAttendees` från rulesScheduler.js.
//
// Körs ALLTID med den inloggade sessionens egna token
// (req.user.accessToken), aldrig Direktåtkomst — det här är alltid en
// live, inloggad handling, aldrig ett bakgrundsjobb.
import { Resend } from 'resend';
import { fetchOrganizedMeetingsWithAttendees } from './rulesScheduler.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'BookR <noreply@onebookr.se>';
const CLAUDE_MODEL = 'claude-sonnet-5-5';
const LOOKAHEAD_MS = 21 * 24 * 60 * 60 * 1000; // tre veckor — räcker för "nästa vecka"

const TOOLS = [
  {
    name: 'cancel_meetings',
    description: 'Avbokar ett eller flera möten som användaren själv organiserar, inom ett datumintervall.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Första datum, format YYYY-MM-DD.' },
        date_to: { type: 'string', description: 'Sista datum (samma som date_from för en enda dag), format YYYY-MM-DD.' },
        with_person_query: { type: 'string', description: 'Namn eller mejl på en specifik deltagare att filtrera på, om nämnt i kommandot. Utelämna annars helt.' }
      },
      required: ['date_from', 'date_to']
    }
  },
  {
    name: 'reschedule_meeting',
    description: 'Flyttar ETT möte (identifierat via person + datum) till nästa lediga tid inom en ny period.',
    input_schema: {
      type: 'object',
      properties: {
        with_person_query: { type: 'string', description: 'Namn eller mejl på personen mötet är med.' },
        meeting_date: { type: 'string', description: 'Vilket datum mötet som ska flyttas ligger på, format YYYY-MM-DD.' },
        target_date_from: { type: 'string', description: 'Start för perioden att hitta en ny tid inom, format YYYY-MM-DD.' },
        target_date_to: { type: 'string', description: 'Slut för perioden att hitta en ny tid inom, format YYYY-MM-DD.' }
      },
      required: ['with_person_query', 'meeting_date', 'target_date_from', 'target_date_to']
    }
  },
  {
    name: 'send_message',
    description: 'Skickar ett fritt, eget formulerat mejl till en person.',
    input_schema: {
      type: 'object',
      properties: {
        to_person_query: { type: 'string', description: 'Namn eller mejl på mottagaren.' },
        message: { type: 'string', description: 'Ett naturligt formulerat meddelande på svenska som uttrycker vad användaren bad om att förmedla.' }
      },
      required: ['to_person_query', 'message']
    }
  },
  {
    name: 'query_meetings',
    description: 'Svarar på en fråga om användarens kommande möten. Ändrar ingenting.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start på perioden frågan gäller, format YYYY-MM-DD.' },
        date_to: { type: 'string', description: 'Slut på perioden frågan gäller, format YYYY-MM-DD.' },
        with_person_query: { type: 'string', description: 'Filtrera på en specifik person, om nämnt.' }
      },
      required: ['date_from', 'date_to']
    }
  }
];

function formatStockholmTime(isoString) {
  try {
    return new Date(isoString).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return isoString;
  }
}

function formatStockholmDate(isoString) {
  try {
    return new Date(isoString).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return isoString;
  }
}

// Samma DST-säkra logik som server.js:s stockholmTimeOnDate — duplicerad
// hit medvetet istället för importerad (se filkommentaren högst upp).
function stockholmTimeOnDate(referenceDate, hour, minute) {
  const guess = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), hour, minute, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(guess);
  const get = (type) => Number(parts.find(p => p.type === type)?.value);
  const shownAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(guess.getTime() - (shownAsUtc - guess.getTime()));
}

function findNextFreeSlot(busyBlocks, durationMinutes, searchFrom, searchUntil) {
  const durationMs = durationMinutes * 60_000;
  const sorted = busyBlocks.map(b => ({ start: new Date(b.start), end: new Date(b.end) })).sort((a, b) => a.start - b.start);
  const day = new Date(searchFrom);
  day.setUTCHours(0, 0, 0, 0);

  while (day <= searchUntil) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const workStart = stockholmTimeOnDate(day, 9, 0);
      const workEnd = stockholmTimeOnDate(day, 17, 0);
      let slotStart = workStart < searchFrom ? new Date(searchFrom) : workStart;
      while (slotStart.getTime() + durationMs <= workEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        const conflict = sorted.some(b => slotStart < b.end && slotEnd > b.start);
        if (!conflict) return { start: slotStart.toISOString(), end: slotEnd.toISOString() };
        slotStart = new Date(slotStart.getTime() + 15 * 60_000);
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
    day.setUTCHours(0, 0, 0, 0);
  }
  return null;
}

// ===== KALENDERMUTATIONER (egna, enkla kopior — se filkommentaren) =====
async function updateCalendarEventTime({ accessToken, provider, eventId, start, end }) {
  const url = provider === 'microsoft'
    ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const body = provider === 'microsoft'
    ? { start: { dateTime: start, timeZone: 'Europe/Stockholm' }, end: { dateTime: end, timeZone: 'Europe/Stockholm' } }
    : { start: { dateTime: start, timeZone: 'Europe/Stockholm' }, end: { dateTime: end, timeZone: 'Europe/Stockholm' } };
  const res = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async function deleteCalendarEventById({ accessToken, provider, eventId }) {
  const url = provider === 'microsoft'
    ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async function sendPlainEmail(to, subject, body) {
  await resend.emails.send({ from: FROM_EMAIL, to: [to], subject, html: body.replace(/\n/g, '<br>'), text: body });
}

// ===== ENTITETSUPPSLAGNING ("Peter" -> mejladress) =====
// Slår BARA upp mot deltagare i användarens egna kommande organiserade
// möten — ingen kontaktlista finns server-side (se plan-filen).
function resolvePerson(query, events) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  const byEmail = new Map();
  for (const event of events) {
    for (const a of event.attendees) {
      if (!a.email) continue;
      if (!byEmail.has(a.email.toLowerCase())) byEmail.set(a.email.toLowerCase(), a.displayName || '');
    }
  }
  return [...byEmail.entries()]
    .filter(([email, name]) => email.includes(q) || (name && name.toLowerCase().includes(q)))
    .map(([email, name]) => ({ email, name }));
}

function resolveOrError(query, events) {
  const matches = resolvePerson(query, events);
  if (matches.length === 1) return { email: matches[0].email, name: matches[0].name };
  if (matches.length === 0) return { error: `Hittade ingen i dina kommande möten som matchar "${query}".` };
  return { error: `Hittade flera som matchar "${query}": ${matches.map(m => m.email).join(', ')} — ange en mejladress istället.` };
}

// ===== CLAUDE: TOLKA KOMMANDOT =====
async function callClaude(command, todayISO) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY saknas — lägg till den i miljövariablerna för att aktivera kommandoassistenten.');
  }
  const systemPrompt = `Du tolkar svenska röst-/textkommandon om kalenderhantering.
Idag är ${todayISO} (Europe/Stockholm). Måndag räknas som veckans första dag.
"Idag" = ${todayISO}. Räkna ut övriga datum (imorgon, nästa vecka, etc.) relativt detta.
Använd ALLTID ett av de fyra verktygen om kommandot alls kan tolkas som en kalenderhandling eller -fråga — svara bara med vanlig text om kommandot är helt orelaterat eller för otydligt för att ens gissa. Gissa aldrig en mejladress — använd personens namn exakt som sagt i with_person_query/to_person_query, systemet slår upp rätt mejl separat.`;

  // ✅ tool_choice: {type:'any'/'tool'} stöds inte av alla modellversioner
  // ("tool_choice: type \"tool\" and \"any\" are not supported for this
  // model") — 'auto' (default, ingen tool_choice alls) fungerar överallt,
  // men betyder att Claude ibland svarar med ren text istället för ett
  // verktygsanrop. Det hanteras nedan istället för att anta att det
  // alltid blir ett verktygsanrop.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: command }],
      tools: TOOLS
    })
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolUse = (data.content || []).find(block => block.type === 'tool_use');
  if (!toolUse) {
    const textBlock = (data.content || []).find(block => block.type === 'text');
    return { textResponse: textBlock?.text || 'Kunde inte tolka kommandot som en åtgärd.' };
  }
  return { name: toolUse.name, input: toolUse.input || {} };
}

// ===== BYGG FÖRHANDSGRANSKNING + ÅTGÄRD =====
// Returnerar antingen { error } (visas direkt, inget att bekräfta/utföra),
// { readOnly: true, result } (query_meetings — utförs alltid direkt), eller
// { preview, action } (en åtgärd som väntar på bekräftelse/utförande).
async function planAction(toolName, input, events, provider) {
  if (toolName === 'query_meetings') {
    const from = new Date(input.date_from);
    const to = new Date(input.date_to + 'T23:59:59');
    let matches = events.filter(e => e.start && new Date(e.start) >= from && new Date(e.start) <= to);
    if (input.with_person_query) {
      const person = resolveOrError(input.with_person_query, events);
      if (person.error) return { error: person.error };
      matches = matches.filter(e => e.attendees.some(a => a.email?.toLowerCase() === person.email));
    }
    if (matches.length === 0) return { readOnly: true, result: 'Du har inga möten i den perioden.' };
    const lines = matches
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .map(e => `• ${e.title} — ${formatStockholmDate(e.start)} kl ${formatStockholmTime(e.start).split(' ').pop()}`);
    return { readOnly: true, result: `Du har ${matches.length} möte(n):\n${lines.join('\n')}` };
  }

  if (toolName === 'cancel_meetings') {
    const from = new Date(input.date_from);
    const to = new Date(input.date_to + 'T23:59:59');
    let matches = events.filter(e => e.start && new Date(e.start) >= from && new Date(e.start) <= to);
    if (input.with_person_query) {
      const person = resolveOrError(input.with_person_query, events);
      if (person.error) return { error: person.error };
      matches = matches.filter(e => e.attendees.some(a => a.email?.toLowerCase() === person.email));
    }
    if (matches.length === 0) return { error: 'Hittade inga möten som matchar det.' };
    const preview = `Avbokar ${matches.length} möte(n):\n${matches.map(e => `• ${e.title} — ${formatStockholmDate(e.start)} kl ${formatStockholmTime(e.start).split(' ').pop()}`).join('\n')}`;
    return {
      preview,
      action: {
        type: 'cancel_meetings',
        provider,
        eventIds: matches.map(e => e.id),
        summary: `Avbokade ${matches.length} möte(n).`
      }
    };
  }

  if (toolName === 'reschedule_meeting') {
    const person = resolveOrError(input.with_person_query, events);
    if (person.error) return { error: person.error };
    const meetingDay = new Date(input.meeting_date);
    const meetingDayEnd = new Date(input.meeting_date + 'T23:59:59');
    const candidates = events.filter(e =>
      e.start && new Date(e.start) >= meetingDay && new Date(e.start) <= meetingDayEnd &&
      e.attendees.some(a => a.email?.toLowerCase() === person.email)
    );
    if (candidates.length === 0) return { error: `Hittade inget möte med ${person.email} den ${input.meeting_date}.` };
    const meeting = candidates[0];
    const durationMinutes = Math.round((new Date(meeting.end) - new Date(meeting.start)) / 60_000);

    const targetFrom = new Date(input.target_date_from);
    const targetTo = new Date(input.target_date_to + 'T23:59:59');
    const busy = events
      .filter(e => e.id !== meeting.id && e.start && e.end)
      .map(e => ({ start: e.start, end: e.end }));
    const slot = findNextFreeSlot(busy, durationMinutes, targetFrom, targetTo);
    if (!slot) return { error: `Hittade ingen ledig tid mellan ${input.target_date_from} och ${input.target_date_to}.` };

    const preview = `Flyttar "${meeting.title}" från ${formatStockholmTime(meeting.start)} till ${formatStockholmTime(slot.start)}, och meddelar ${person.email}.`;
    return {
      preview,
      action: {
        type: 'reschedule_meeting',
        provider,
        eventId: meeting.id,
        title: meeting.title,
        newStart: slot.start,
        newEnd: slot.end,
        attendeeEmail: person.email,
        summary: `Flyttade "${meeting.title}" till ${formatStockholmTime(slot.start)} och meddelade ${person.email}.`
      }
    };
  }

  if (toolName === 'send_message') {
    const person = resolveOrError(input.to_person_query, events);
    if (person.error) return { error: person.error };
    const preview = `Skickar mejl till ${person.email}:\n"${input.message}"`;
    return {
      preview,
      action: {
        type: 'send_message',
        toEmail: person.email,
        message: input.message,
        summary: `Mejl skickat till ${person.email}.`
      }
    };
  }

  return { error: 'Okänt kommando.' };
}

// ===== UTFÖR EN BEKRÄFTAD ÅTGÄRD =====
async function executeAction(action, { accessToken }) {
  switch (action.type) {
    case 'cancel_meetings':
      for (const eventId of action.eventIds) {
        await deleteCalendarEventById({ accessToken, provider: action.provider, eventId });
      }
      return action.summary;
    case 'reschedule_meeting':
      await updateCalendarEventTime({ accessToken, provider: action.provider, eventId: action.eventId, start: action.newStart, end: action.newEnd });
      await sendPlainEmail(action.attendeeEmail, `Mötet "${action.title}" har flyttats`, `Hej,\n\nMötet "${action.title}" har flyttats till ${formatStockholmTime(action.newStart)}.\n\nMvh BookR`);
      return action.summary;
    case 'send_message':
      await sendPlainEmail(action.toEmail, 'Meddelande från BookR', action.message);
      return action.summary;
    default:
      throw new Error('Okänd åtgärdstyp');
  }
}

// ===== HUVUDFUNKTION: tolka ett kommando givet kontext =====
// `contextFetcher` hämtar organisatörens kommande möten — anropas här
// istället för i server.js så modulen förblir självförsörjande.
async function interpretCommand(command, { accessToken, provider }) {
  const now = new Date();
  const events = await fetchOrganizedMeetingsWithAttendees(accessToken, provider, now.toISOString(), new Date(now.getTime() + LOOKAHEAD_MS).toISOString());
  // en-CA ger garanterat YYYY-MM-DD, oavsett körmiljöns default-locale.
  const todayISO = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Stockholm' });

  const claudeResult = await callClaude(command, todayISO);
  if (claudeResult.textResponse) {
    return { error: claudeResult.textResponse };
  }
  const { name, input } = claudeResult;
  const planned = await planAction(name, input, events, provider);
  return { toolName: name, ...planned };
}

export { interpretCommand, executeAction };

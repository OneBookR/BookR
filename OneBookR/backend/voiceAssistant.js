// ✅ RÖSTASSISTENT — text/röststyrda kommandon ("Avboka alla möten
// idag", "Boka om mötet med Valdemar till nästa vecka", "Skicka ett
// mail till Anders att jag blir 5 min sen", "Vilka har jag möte med
// idag?").
//
// Helt självförsörjande modul, egen Resend-klient och egna kalender-
// mutationer — importerar INTE från server.js (server.js är
// entrypointen och startar Express/app.listen vid import, så en
// cirkulär import därifrån hade startat en andra serverinstans).
// Återanvänder bara den redan existerande, testade
// `fetchOrganizedMeetingsWithAttendees` från rulesScheduler.js.
//
// ✅ Entitetsuppslagning ("vem är Valdemar?") görs INTE längre av egen
// kod som fuzzy-matchar en namnsträng — Claude får själv all kontext
// (kontakter, direktåtkomst, kalenderdeltagare) och resolvar till en
// riktig mejladress direkt i sitt verktygsanrop. Det matchar bättre hur
// man faktiskt pratar med en assistent: den ska "veta" vilka man menar,
// inte kräva en exakt sträng-match i efterhand. Ett sista
// sundhetskontroll-steg (knownEmails) vägrar ändå agera på en mejladress
// som inte fanns någonstans i kontexten den fick — annars kunde en
// hallucinerad adress smyga sig igenom.
//
// Den inloggade ägarens EGNA handlingar (avboka/boka om/mejla) körs
// alltid med sessionens egna token (req.user.accessToken), aldrig
// Direktåtkomst. Undantag: book_meeting kan DESSUTOM slå upp en annan
// persons Direktåtkomst-token (bara om ett `direct_access_links`-par
// redan finns — se checken i server.js) för att hitta en tid som
// passar BÅDA, inte bara ägaren.
import { Resend } from 'resend';
import { fetchOrganizedMeetingsWithAttendees } from './rulesScheduler.js';
import { getUserBookingPageSlug } from './firestore.js';
import { getDirectAccessToken } from './token-refresh.js';

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
        with_person_email: { type: 'string', description: 'Mejladressen till en specifik deltagare att filtrera på, om en person nämndes — slå upp mot personlistan i kontexten. Utelämna annars helt.' }
      },
      required: ['date_from', 'date_to']
    }
  },
  {
    name: 'book_meeting',
    description: 'Bokar ett HELT NYTT möte med någon som inte redan har ett befintligt möte att utgå från. Skiljer sig från reschedule_meeting (flyttar ett BEFINTLIGT möte) och från share_booking_link (skickar bara en länk, bokar inget direkt). Använd det här som förstahandsval när användaren ber om att boka/sätta upp/ordna ett möte med en känd person — oavsett om personen har Direktåtkomst eller inte.',
    input_schema: {
      type: 'object',
      properties: {
        with_person_email: { type: 'string', description: 'Mejladressen till personen att boka med — slå upp mot personlistan i kontexten.' },
        date_from: { type: 'string', description: 'Start för perioden att hitta en ledig tid inom, format YYYY-MM-DD.' },
        date_to: { type: 'string', description: 'Slut för perioden att hitta en ledig tid inom, format YYYY-MM-DD.' },
        duration_minutes: { type: 'integer', description: 'Mötets längd i minuter. Anta 30 om inget sägs.' },
        title: { type: 'string', description: 'Mötets namn, EXAKT som användaren sa det. Hittade du inget i kommandot, utelämna fältet helt — gissa eller hitta ALDRIG på ett namn själv.' }
      },
      required: ['with_person_email', 'date_from', 'date_to']
    }
  },
  {
    name: 'reschedule_meeting',
    description: 'Flyttar ETT redan befintligt möte (identifierat via person + datum) till nästa lediga tid inom en ny period.',
    input_schema: {
      type: 'object',
      properties: {
        with_person_email: { type: 'string', description: 'Mejladressen till personen mötet är med — slå upp mot personlistan i kontexten.' },
        meeting_date: { type: 'string', description: 'Vilket datum mötet som ska flyttas ligger på, format YYYY-MM-DD.' },
        target_date_from: { type: 'string', description: 'Start för perioden att hitta en ny tid inom, format YYYY-MM-DD.' },
        target_date_to: { type: 'string', description: 'Slut för perioden att hitta en ny tid inom, format YYYY-MM-DD.' }
      },
      required: ['with_person_email', 'meeting_date', 'target_date_from', 'target_date_to']
    }
  },
  {
    name: 'send_message',
    description: 'Skickar ett fritt, eget formulerat mejl till en person.',
    input_schema: {
      type: 'object',
      properties: {
        to_person_email: { type: 'string', description: 'Mejladressen till mottagaren — slå upp mot personlistan i kontexten.' },
        message: { type: 'string', description: 'Ett naturligt formulerat meddelande på svenska som uttrycker vad användaren bad om att förmedla.' }
      },
      required: ['to_person_email', 'message']
    }
  },
  {
    name: 'share_booking_link',
    description: 'Skickar bara användarens bokningssidelänk till någon — bokar INGET möte direkt. Använd BARA när användaren uttryckligen ber om att skicka en länk/be personen boka själv. Be INTE om en länk av dig själv bara för att en person saknar ett befintligt möte eller Direktåtkomst — använd book_meeting för att faktiskt boka åt dem istället.',
    input_schema: {
      type: 'object',
      properties: {
        to_person_email: { type: 'string', description: 'Mejladressen till mottagaren — slå upp mot personlistan i kontexten.' },
        note: { type: 'string', description: 'Ett kort, valfritt medskickat meddelande på svenska. Utelämna om inget särskilt sades.' }
      },
      required: ['to_person_email']
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
        with_person_email: { type: 'string', description: 'Filtrera på en specifik person, om nämnd — slå upp mot personlistan i kontexten.' }
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

// "a, b och c" — naturlig uppräkning i löpande text, inte punktlistor.
// Svar kan läsas upp av en talsyntes, så listor måste låta som tal.
function joinNaturally(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} och ${items[items.length - 1]}`;
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
// Bokar ett nytt möte och bjuder in personen som deltagare — fungerar
// OAVSETT om BookR kan läsa personens kalender eller inte (precis som en
// vanlig kalenderinbjudan alltid går att skicka utan att behöva läsa
// mottagarens kalender först). sendUpdates=all/Graphs standardbeteende
// ser till att personen faktiskt får en riktig kalenderinbjudan.
async function createCalendarEventWithAttendee({ accessToken, provider, title, start, end, attendeeEmail }) {
  if (provider === 'microsoft') {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: title,
        start: { dateTime: start, timeZone: 'Europe/Stockholm' },
        end: { dateTime: end, timeZone: 'Europe/Stockholm' },
        attendees: [{ emailAddress: { address: attendeeEmail }, type: 'required' }]
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return { eventId: (await res.json()).id };
  }
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: title,
      start: { dateTime: start, timeZone: 'Europe/Stockholm' },
      end: { dateTime: end, timeZone: 'Europe/Stockholm' },
      attendees: [{ email: attendeeEmail }]
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return { eventId: (await res.json()).id };
}

async function updateCalendarEventTime({ accessToken, provider, eventId, start, end }) {
  const url = provider === 'microsoft'
    ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const body = { start: { dateTime: start, timeZone: 'Europe/Stockholm' }, end: { dateTime: end, timeZone: 'Europe/Stockholm' } };
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

// ===== KONTEXT ÅT CLAUDE: vilka personer känner BookR till? =====
// Tre källor, alla märkta så Claude vet VARFÖR den känner till någon:
// 1. Kontakter (namn+mejl) — skickas med av frontend från dess lokala
//    adressbok (bookr_team_contacts_*), eftersom det inte finns någon
//    server-side kontaktlista med namn (se plan-filen).
// 2. Direktåtkomst-länkar (bara mejl, riktig backend-relation) — det
//    här är poängen användaren påpekade: man kan bara rimligen boka om
//    med/avboka någon man har en etablerad relation med.
// 3. Deltagare i kommande möten (mejl + ev. namn från Google/Microsoft).
function buildContextBlock(events, directAccessEmails, contacts) {
  const lines = [];
  const contactEmails = new Set(contacts.map(c => c.email?.toLowerCase()).filter(Boolean));

  if (contacts.length > 0) {
    lines.push('Kända kontakter (namn → mejl):');
    for (const c of contacts) {
      const tag = contactEmails.has(c.email?.toLowerCase()) && directAccessEmails.includes(c.email.toLowerCase()) ? ' [har direktåtkomst]' : '';
      lines.push(`- ${c.name || '(okänt namn)'} <${c.email}>${tag}`);
    }
  }

  const extraDirectAccess = directAccessEmails.filter(e => !contactEmails.has(e));
  if (extraDirectAccess.length > 0) {
    lines.push('Direktåtkomst utan sparat namn:');
    for (const e of extraDirectAccess) lines.push(`- <${e}> [har direktåtkomst]`);
  }

  const byEmail = new Map();
  for (const event of events) {
    for (const a of event.attendees) {
      if (!a.email) continue;
      const key = a.email.toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, { displayName: a.displayName, meetings: [] });
      byEmail.get(key).meetings.push(`${event.title} (${formatStockholmDate(event.start)})`);
    }
  }
  if (byEmail.size > 0) {
    lines.push('Personer i kommande möten:');
    for (const [email, info] of byEmail) {
      const namePart = info.displayName ? `${info.displayName} ` : '';
      lines.push(`- ${namePart}<${email}> — ${info.meetings.slice(0, 3).join(', ')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '(Inga kända kontakter, direktåtkomster eller mötesdeltagare hittades.)';
}

function collectKnownEmails(events, directAccessEmails, contacts) {
  const set = new Set();
  for (const c of contacts) if (c.email) set.add(c.email.toLowerCase());
  for (const e of directAccessEmails) set.add(e.toLowerCase());
  for (const event of events) for (const a of event.attendees) if (a.email) set.add(a.email.toLowerCase());
  return set;
}

function buildSystemPrompt(todayISO, contextBlock) {
  return `Du är användarens personliga assistent/sekreterare för kalendern — inte ett kommandotolkningsverktyg. Du tolkar svenska röst-/textkommandon om kalenderhantering.

TON: varm, naturlig och kortfattad, som en skicklig assistent som redan känner till sammanhanget — aldrig robotisk eller formell. Skriv "Visst, jag bokar..." eller "Jag ser att...", inte "Kommandot tolkades som...". Dina svar kan läsas upp högt av en talsyntes — skriv därför alltid i hela, naturligt talade meningar. ALDRIG punktlistor, "•", radbrytningar mellan punkter, markdown eller förkortningar — räkna upp flera saker i löpande text ("du har tre möten idag: X klockan nio, Y klockan tio och Z klockan tolv"), aldrig som en lista.

Idag är ${todayISO} (Europe/Stockholm). Måndag räknas som veckans första dag. Räkna ut övriga datum (imorgon, nästa vecka, etc.) relativt detta.

${contextBlock}

Använd personlistan ovan för att slå upp vem användaren menar (with_person_email/to_person_email) — matcha mot namn, smeknamn eller mejl. Använd BARA mejladresser som faktiskt finns i listan. Om du inte kan avgöra en entydig person utifrån listan, eller om personen inte finns där alls, svara med vanlig text och fråga om förtydligande — gissa aldrig en mejladress som inte står i listan.
Det här är en PÅGÅENDE konversation — om du tidigare bad om ett förtydligande (vilken person, vilket möte, vilket datum) så tolkar du användarens nya svar TILLSAMMANS MED det ursprungliga kommandot tidigare i samtalet, inte som ett helt nytt, fristående kommando. Släpp aldrig den ursprungliga avsikten (t.ex. "avboka") bara för att användaren bara svarade med ett namn eller ett datum.
Om kommandot ber om flera saker (t.ex. "avboka mötet med X och skicka en ny länk"), anropa flera verktyg i samma svar — ett per deluppgift.
Använd alltid något av verktygen när du har tillräckligt med information — fråga bara om förtydligande när det faktiskt behövs.
När användaren ber om att BOKA/SÄTTA UPP/ORDNA ett möte med någon: använd book_meeting som förstahandsval, ÄVEN om personen saknar Direktåtkomst eller inte har något möte sedan tidigare — book_meeting bokar själv utan att behöva läsa personens kalender (det är bara en bonus om personen råkar ha Direktåtkomst). Föreslå share_booking_link bara om användaren uttryckligen bett om en länk, eller book_meeting uttryckligen misslyckats. Sa användaren INTE vad mötet ska heta: anropa INTE book_meeting än — svara med vanlig text och fråga "Vad ska mötet heta?", precis som du frågar om förtydligande kring en oklar person. Gissa eller hitta ALDRIG på ett mötesnamn själv.`;
}

// ===== CLAUDE: TOLKA KOMMANDOT =====
// `messages` är HELA den pågående konversationen (tidigare förtydligande-
// frågor + svar), inte bara det senaste kommandot — annars tappar Claude
// den ursprungliga avsikten varje gång användaren bara svarar på en
// följdfråga (t.ex. bara ett namn, utan att upprepa "avboka").
async function callClaude(messages, systemPrompt) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY saknas — lägg till den i miljövariablerna för att aktivera kommandoassistenten.');
  }
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
      messages,
      tools: TOOLS
    })
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolUses = (data.content || []).filter(block => block.type === 'tool_use');
  if (toolUses.length === 0) {
    const textBlock = (data.content || []).find(block => block.type === 'text');
    return { textResponse: textBlock?.text || 'Kunde inte tolka kommandot som en åtgärd.', rawContent: data.content };
  }
  return { toolCalls: toolUses.map(t => ({ name: t.name, input: t.input || {} })), rawContent: data.content };
}

// ===== BYGG FÖRHANDSGRANSKNING + ÅTGÄRD FÖR ETT VERKTYGSANROP =====
// Returnerar antingen { error }, { readOnly: true, result } (query_meetings
// — utförs alltid direkt), eller { preview, action }.
async function planAction(toolName, input, events, provider, knownEmails, ownerEmail, directAccessEmailSet) {
  const checkKnown = (email, label) => {
    if (!email) return `Ingen mejladress angavs för ${label}.`;
    if (!knownEmails.has(email.toLowerCase())) return `Känner inte igen "${email}" som en kontakt, direktåtkomst eller mötesdeltagare — be om ett förtydligande.`;
    return null;
  };

  if (toolName === 'query_meetings') {
    const from = new Date(input.date_from);
    const to = new Date(input.date_to + 'T23:59:59');
    let matches = events.filter(e => e.start && new Date(e.start) >= from && new Date(e.start) <= to);
    if (input.with_person_email) {
      const err = checkKnown(input.with_person_email, 'personen');
      if (err) return { error: err };
      matches = matches.filter(e => e.attendees.some(a => a.email?.toLowerCase() === input.with_person_email.toLowerCase()));
    }
    if (matches.length === 0) return { readOnly: true, result: 'Du har inga möten i den perioden.' };
    const items = matches
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .map(e => `${e.title} klockan ${formatStockholmTime(e.start).split(' ').pop()}`);
    return { readOnly: true, result: `Du har ${matches.length} möte${matches.length > 1 ? 'n' : ''}: ${joinNaturally(items)}.` };
  }

  if (toolName === 'cancel_meetings') {
    const from = new Date(input.date_from);
    const to = new Date(input.date_to + 'T23:59:59');
    let matches = events.filter(e => e.start && new Date(e.start) >= from && new Date(e.start) <= to);
    if (input.with_person_email) {
      const err = checkKnown(input.with_person_email, 'personen');
      if (err) return { error: err };
      matches = matches.filter(e => e.attendees.some(a => a.email?.toLowerCase() === input.with_person_email.toLowerCase()));
    }
    if (matches.length === 0) return { error: 'Hittade inga möten som matchar det.' };
    const matchItems = matches.map(e => `${e.title} ${formatStockholmDate(e.start)} klockan ${formatStockholmTime(e.start).split(' ').pop()}`);
    const preview = `Avbokar ${matches.length} möte${matches.length > 1 ? 'n' : ''}: ${joinNaturally(matchItems)}.`;
    return {
      preview,
      card: {
        what: `Avboka ${matches.length} möte${matches.length > 1 ? 'n' : ''}`,
        withWhom: input.with_person_email || matches.map(e => e.title).join(', '),
        when: input.date_from === input.date_to ? formatStockholmDate(input.date_from) : `${formatStockholmDate(input.date_from)} – ${formatStockholmDate(input.date_to)}`
      },
      action: { type: 'cancel_meetings', provider, eventIds: matches.map(e => e.id), summary: `Avbokade ${matches.length} möte(n).` }
    };
  }

  if (toolName === 'book_meeting') {
    const err = checkKnown(input.with_person_email, 'personen');
    if (err) return { error: err };
    // ✅ Kodnivå-spärr, inte bara en promptinstruktion — oavsett om Claude
    // följer instruktionen att inte gissa en titel eller inte, bokas
    // aldrig ett möte som bara heter "Möte". Samma
    // förtydligande-mekanism som en oklar person redan använder: svaret
    // fortsätter samma konversationstråd (se interpretCommand).
    if (!input.title || !input.title.trim()) {
      return { error: 'Vad ska mötet heta?' };
    }
    const personEmail = input.with_person_email.toLowerCase();
    const duration = Number(input.duration_minutes) > 0 ? Number(input.duration_minutes) : 30;
    const title = input.title.trim();

    const searchFrom = new Date(input.date_from);
    const searchTo = new Date(input.date_to + 'T23:59:59');

    // Egen upptagen tid (redan hämtad för ägaren).
    let busy = events.filter(e => e.start && e.end).map(e => ({ start: e.start, end: e.end }));

    // ✅ Bonus, inte krav: har personen Direktåtkomst OCH själv kopplat sin
    // kalender, kolla ÄVEN mot den så tiden passar båda. Finns ingen sådan
    // koppling (eller går uppslaget fel) bokar vi ändå — bara mot egen
    // kalender — precis som en vanlig kalenderinbjudan alltid går att
    // skicka utan att man kan läsa mottagarens kalender.
    let usedMutual = false;
    if (directAccessEmailSet.has(personEmail)) {
      try {
        const otherToken = await getDirectAccessToken(personEmail);
        if (otherToken) {
          const otherEvents = await fetchOrganizedMeetingsWithAttendees(otherToken.accessToken, otherToken.provider, searchFrom.toISOString(), searchTo.toISOString());
          busy = busy.concat(otherEvents.filter(e => e.start && e.end).map(e => ({ start: e.start, end: e.end })));
          usedMutual = true;
        }
      } catch (err) {
        console.error(`[Kommandon] Kunde inte läsa ${personEmail}s kalender, bokar bara mot egen:`, err.message);
      }
    }

    const slot = findNextFreeSlot(busy, duration, searchFrom, searchTo);
    if (!slot) return { error: `Hittade ingen ledig tid mellan ${input.date_from} och ${input.date_to}${usedMutual ? ' som passar er båda' : ''}.` };

    const preview = `Bokar "${title}" med ${input.with_person_email} ${formatStockholmTime(slot.start)}${usedMutual ? ' (kollat mot bådas kalendrar)' : ''}.`;
    return {
      preview,
      card: { what: `Boka "${title}"`, withWhom: input.with_person_email, when: formatStockholmTime(slot.start) },
      action: {
        type: 'book_meeting', provider, title, start: slot.start, end: slot.end, attendeeEmail: input.with_person_email,
        summary: `Bokade "${title}" med ${input.with_person_email} ${formatStockholmTime(slot.start)}.`
      }
    };
  }

  if (toolName === 'reschedule_meeting') {
    const err = checkKnown(input.with_person_email, 'personen mötet är med');
    if (err) return { error: err };
    const personEmail = input.with_person_email.toLowerCase();

    const meetingDay = new Date(input.meeting_date);
    const meetingDayEnd = new Date(input.meeting_date + 'T23:59:59');
    const candidates = events.filter(e =>
      e.start && new Date(e.start) >= meetingDay && new Date(e.start) <= meetingDayEnd &&
      e.attendees.some(a => a.email?.toLowerCase() === personEmail)
    );
    if (candidates.length === 0) return { error: `Hittade inget möte med ${input.with_person_email} den ${input.meeting_date}.` };
    const meeting = candidates[0];
    const durationMinutes = Math.round((new Date(meeting.end) - new Date(meeting.start)) / 60_000);

    const targetFrom = new Date(input.target_date_from);
    const targetTo = new Date(input.target_date_to + 'T23:59:59');
    const busy = events.filter(e => e.id !== meeting.id && e.start && e.end).map(e => ({ start: e.start, end: e.end }));
    const slot = findNextFreeSlot(busy, durationMinutes, targetFrom, targetTo);
    if (!slot) return { error: `Hittade ingen ledig tid mellan ${input.target_date_from} och ${input.target_date_to}.` };

    const preview = `Flyttar "${meeting.title}" från ${formatStockholmTime(meeting.start)} till ${formatStockholmTime(slot.start)}, och meddelar ${input.with_person_email}.`;
    return {
      preview,
      card: { what: `Boka om "${meeting.title}"`, withWhom: input.with_person_email, when: `${formatStockholmTime(meeting.start)} → ${formatStockholmTime(slot.start)}` },
      action: {
        type: 'reschedule_meeting', provider, eventId: meeting.id, title: meeting.title,
        newStart: slot.start, newEnd: slot.end, attendeeEmail: input.with_person_email,
        summary: `Flyttade "${meeting.title}" till ${formatStockholmTime(slot.start)} och meddelade ${input.with_person_email}.`
      }
    };
  }

  if (toolName === 'send_message') {
    const err = checkKnown(input.to_person_email, 'mottagaren');
    if (err) return { error: err };
    const preview = `Skickar mejl till ${input.to_person_email}:\n"${input.message}"`;
    return {
      preview,
      card: { what: 'Skicka mejl', withWhom: input.to_person_email, when: 'Nu' },
      action: { type: 'send_message', toEmail: input.to_person_email, message: input.message, summary: `Mejl skickat till ${input.to_person_email}.` }
    };
  }

  if (toolName === 'share_booking_link') {
    const err = checkKnown(input.to_person_email, 'mottagaren');
    if (err) return { error: err };
    const slug = await getUserBookingPageSlug(ownerEmail);
    if (!slug) return { error: 'Du har ingen bokningssida konfigurerad än — skapa en under "Bokningssida" först.' };
    const link = `https://www.onebookr.se/boka/${slug}`;
    const message = `Hej!\n\n${input.note ? input.note + '\n\n' : ''}Boka en tid direkt här: ${link}\n\nMvh`;
    const preview = `Skickar din bokningslänk till ${input.to_person_email}${input.note ? ` med meddelandet: "${input.note}"` : ''}.`;
    return {
      preview,
      card: { what: 'Skicka bokningslänk', withWhom: input.to_person_email, when: 'Nu' },
      action: { type: 'send_message', toEmail: input.to_person_email, message, summary: `Bokningslänk skickad till ${input.to_person_email}.` }
    };
  }

  return { error: 'Okänt kommando.' };
}

// ===== UTFÖR EN BEKRÄFTAD ÅTGÄRD =====
async function executeAction(action, { accessToken }) {
  switch (action.type) {
    case 'book_meeting':
      await createCalendarEventWithAttendee({ accessToken, provider: action.provider, title: action.title, start: action.start, end: action.end, attendeeEmail: action.attendeeEmail });
      return action.summary;
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

async function executeActions(actions, ctx) {
  const results = [];
  for (const action of actions) {
    results.push(await executeAction(action, ctx));
  }
  return results.join('\n');
}

// ===== PROAKTIV BRIEFING =====
// Deterministisk, inget Claude-anrop — en sekreterare som själv flaggar
// det uppenbara (dagens möten, krockande tider) kräver ingen tolkning,
// bara att man faktiskt tittar. Visas när sidan laddas, inte bara när
// man frågar om det.
async function getBriefing({ accessToken, provider }) {
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

  const events = await fetchOrganizedMeetingsWithAttendees(accessToken, provider, dayStart.toISOString(), dayEnd.toISOString());
  const todays = events.filter(e => e.start && e.end).sort((a, b) => new Date(a.start) - new Date(b.start));

  if (todays.length === 0) return { text: 'Du har inga möten inbokade idag — en lugn dag.' };

  const conflicts = [];
  for (let i = 0; i < todays.length; i++) {
    for (let j = i + 1; j < todays.length; j++) {
      if (new Date(todays[i].start) < new Date(todays[j].end) && new Date(todays[j].start) < new Date(todays[i].end)) {
        conflicts.push([todays[i], todays[j]]);
      }
    }
  }

  const items = todays.map(e => `${e.title} klockan ${formatStockholmTime(e.start).split(' ').pop()}`);
  let text = `Du har ${todays.length} möte${todays.length > 1 ? 'n' : ''} idag: ${joinNaturally(items)}.`;
  if (conflicts.length > 0) {
    const [a, b] = conflicts[0];
    text += ` Lägg märke till att "${a.title}" och "${b.title}" krockar.`;
  }
  return { text };
}

// ===== HUVUDFUNKTION: tolka ett kommando givet kontext =====
// `directAccessEmails`/`contacts` kommer från server.js (Firestore
// respektive frontendens lokala adressbok) — se filkommentaren högst
// upp för varför båda behövs.
async function interpretCommand(command, { accessToken, provider, ownerEmail, directAccessEmails = [], contacts = [], conversationHistory = [] }) {
  const now = new Date();
  const events = await fetchOrganizedMeetingsWithAttendees(accessToken, provider, now.toISOString(), new Date(now.getTime() + LOOKAHEAD_MS).toISOString());
  const todayISO = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Stockholm' }); // en-CA ger garanterat YYYY-MM-DD

  const contextBlock = buildContextBlock(events, directAccessEmails, contacts);
  const knownEmails = collectKnownEmails(events, directAccessEmails, contacts);
  const directAccessEmailSet = new Set(directAccessEmails.map(e => e.toLowerCase()));
  const systemPrompt = buildSystemPrompt(todayISO, contextBlock);

  // ✅ Hela den pågående konversationen skickas med varje gång — annars
  // tappar Claude den ursprungliga avsikten så fort användaren bara
  // svarar på en förtydligande-fråga (se filkommentaren vid callClaude).
  const messages = [...conversationHistory, { role: 'user', content: command }];
  const claudeResult = await callClaude(messages, systemPrompt);

  if (claudeResult.textResponse) {
    return {
      error: claudeResult.textResponse,
      conversationHistory: [...messages, { role: 'assistant', content: claudeResult.rawContent }]
    };
  }

  const planned = [];
  for (const call of claudeResult.toolCalls) {
    const result = await planAction(call.name, call.input, events, provider, knownEmails, ownerEmail, directAccessEmailSet);
    if (result.error) {
      // Även ett valideringsfel (t.ex. en okänd mejladress) fortsätter
      // samma konversationstråd — användaren ska kunna förtydliga utan
      // att behöva upprepa hela kommandot från början.
      return {
        error: result.error,
        conversationHistory: [...messages, { role: 'assistant', content: claudeResult.rawContent }]
      };
    }
    planned.push(result);
  }

  if (planned.every(p => p.readOnly)) {
    return { readOnly: true, result: planned.map(p => p.result).join('\n\n') };
  }

  return {
    preview: planned.map(p => p.preview).filter(Boolean).join('\n\n'),
    cards: planned.filter(p => p.action).map(p => p.card).filter(Boolean),
    actions: planned.filter(p => p.action).map(p => p.action)
  };
}

// ===== ELEVENLABS: TEXT TILL TAL =====
// Ersätter webbläsarens inbyggda speechSynthesis (som alltid låter
// mekanisk/robotaktig) med en riktig molnröst — samma kategori naturlig,
// mänsklig röst som Claude/ChatGPTs röstläge. eleven_multilingual_v2
// hanterar svenska naturligt utan att en svensk-specifik röst krävs.
const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // "Rachel" — varm, neutral, bred språksupport

async function textToSpeech(text) {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY saknas — lägg till den i miljövariablerna för att aktivera röstsvar.');
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULT_VOICE_ID;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      // ✅ Hög stability (0.5 var defaulten) gör rösten monoton/"stel" —
      // ElevenLabs håller leveransen extremt konsekvent vilket på
      // bekostnad av naturlig variation i betoning. Sänkt hit + ett
      // style-värde (exaggeration mot röstens egen karaktär) ger en
      // betydligt mer levande, mänsklig leverans. use_speaker_boost
      // förbättrar tydlighet/likhet med källrösten.
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true }
    })
  });
  const contentType = res.headers.get('content-type') || '';
  // ✅ ElevenLabs kan svara med JSON (t.ex. ogiltig nyckel, fel voice_id,
  // slut på krediter) — ibland även med en 200-status. Om det INTE
  // faktiskt är ljud ska det ALDRIG skickas vidare som om det vore det;
  // annars blir webbläsarens fel bara ett obegripligt "uppspelningsfel"
  // istället för den riktiga anledningen.
  if (!res.ok || !contentType.startsWith('audio/')) {
    const body = await res.text();
    throw new Error(`ElevenLabs API ${res.status} (${contentType || 'okänd typ'}): ${body.slice(0, 500)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) {
    throw new Error(`ElevenLabs returnerade ett ovanligt litet ljudsvar (${buffer.length} bytes) — troligen inte giltigt ljud.`);
  }
  return { buffer, contentType };
}

export { interpretCommand, executeActions, getBriefing, textToSpeech };

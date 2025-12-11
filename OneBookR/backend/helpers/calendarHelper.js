// ✅ ROBUST CALENDAR API INTERACTIONS
export async function getFreeBusy(token, timeMin, timeMax, provider = 'google') {
  try {
    if (!token || typeof token !== 'string') {
      console.warn('[Calendar] Invalid token provided');
      return { calendars: {} };
    }
    
    if (provider === 'microsoft') {
      return getMicrosoftFreeBusy(token, timeMin, timeMax);
    }
    
    return getGoogleFreeBusy(token, timeMin, timeMax);
    
  } catch (error) {
    console.error(`[Calendar] FreeBusy error for ${provider}:`, error);
    return { calendars: {} };
  }
}

async function getGoogleFreeBusy(token, timeMin, timeMax) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: 'primary' }]
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 401) {
        console.warn('[Google] Token expired');
        return { calendars: {} };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn('[Google] Request timeout');
    } else {
      console.error('[Google] FreeBusy error:', error);
    }
    return { calendars: {} };
  }
}

async function getMicrosoftFreeBusy(token, timeMin, timeMax) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    // ✅ ANVÄND UTC TIDER I FILTER
    const startTime = new Date(timeMin).toISOString();
    const endTime = new Date(timeMax).toISOString();
    
    // ✅ HÄMTA EVENTS - Microsoft returnerar tider i UTC när vi använder ISO-format i filter
    const eventsUrl = `https://graph.microsoft.com/v1.0/me/events?` +
      `$filter=start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'&` +
      `$select=start,end,showAs,isAllDay,isCancelled&` +
      `$orderby=start/dateTime&$top=2500`;

    const response = await fetch(eventsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'outlook.timezone="UTC"'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 401) {
        console.warn('[Microsoft] Token expired');
        return { calendars: {} };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const events = data.value || [];
    
    // ✅ KONVERTERA EVENTS - Med Prefer header returnerar Microsoft redan UTC-tider
    const busyTimes = events
      .filter(event => !event.isCancelled && event.showAs !== 'free')
      .map(event => {
        // Med Prefer: outlook.timezone="UTC" returnerar Microsoft redan UTC-tider
        // Vi behöver bara se till att de är i ISO-format
        const startStr = event.start.dateTime;
        const endStr = event.end.dateTime;
        
        // Säkerställ ISO-format med Z
        const startUTC = ensureUTCFormat(startStr);
        const endUTC = ensureUTCFormat(endStr);
        
        return {
          start: startUTC,
          end: endUTC
        };
      });
    
    console.log(`[Microsoft] Found ${busyTimes.length} busy periods from ${events.length} events`);
    if (busyTimes.length > 0 && events[0]) {
      console.log('[Microsoft] Sample:', {
        original: `${events[0].start.dateTime}`,
        converted: busyTimes[0].start
      });
    }
    
    return {
      calendars: {
        primary: { busy: busyTimes }
      }
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn('[Microsoft] Request timeout');
    } else {
      console.error('[Microsoft] FreeBusy error:', error);
    }
    return { calendars: {} };
  }
}

// ✅ SÄKERSTÄLL UTC ISO-FORMAT
function ensureUTCFormat(dateStr) {
  try {
    if (!dateStr) return new Date().toISOString();
    
    // Om redan i ISO-format med Z, returnera som är
    if (dateStr.endsWith('Z')) {
      return dateStr;
    }
    
    // Om det är en lokal tid utan Z, lägg till Z för att indikera UTC
    if (dateStr.includes('T') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      return dateStr + 'Z';
    }
    
    // Annars parse och konvertera
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    
    return new Date().toISOString();
  } catch (error) {
    console.warn('[Microsoft] Format error for', dateStr, ':', error.message);
    return new Date(dateStr).toISOString();
  }
}

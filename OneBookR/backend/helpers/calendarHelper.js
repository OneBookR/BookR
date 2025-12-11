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
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
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
    // ✅ MICROSOFT GRAPH API - HÄMTA EVENTS DIREKT
    const startTime = new Date(timeMin).toISOString();
    const endTime = new Date(timeMax).toISOString();
    
    const eventsUrl = `https://graph.microsoft.com/v1.0/me/events?` +
      `$filter=start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'&` +
      `$select=start,end,showAs,isAllDay,isCancelled&` +
      `$orderby=start/dateTime&$top=2500`;

    const response = await fetch(eventsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
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
    
    // ✅ KONVERTERA TILL GOOGLE FREEBUSY FORMAT
    const busyTimes = events
      .filter(event => !event.isCancelled && event.showAs !== 'free')
      .map(event => ({
        start: event.start.dateTime,
        end: event.end.dateTime
      }));
    
    console.log(`[Microsoft] Found ${busyTimes.length} busy periods from ${events.length} events`);
    
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

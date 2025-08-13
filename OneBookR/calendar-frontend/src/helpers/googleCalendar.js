import fetch from 'node-fetch';

export async function getCalendarEvents(token, timeMin, timeMax) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Misslyckades att hämta kalenderhändelser');
  }

  return data.items || [];
}
export async function getCalendarEvents(token, timeMin, timeMax, maxResults = 50) {
	// Skydda vid saknad token
	if (!token) return { items: [] };
	const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
		timeMin || new Date().toISOString()
	)}&timeMax=${encodeURIComponent(timeMax || new Date(Date.now() + 7 * 864e5).toISOString())}&singleEvents=true&orderBy=startTime&maxResults=${encodeURIComponent(
		maxResults
	)}`;

	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) {
		// Returnera tom lista istället för att kasta fel i render
		return { items: [] };
	}
	return res.json();
}

export async function getFreeBusy(token, timeMin, timeMax, items = [{ id: 'primary' }]) {
	if (!token) return { calendars: {} };
	const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			timeMin: timeMin || new Date().toISOString(),
			timeMax: timeMax || new Date(Date.now() + 7 * 864e5).toISOString(),
			items
		})
	});
	if (!res.ok) {
		return { calendars: {} };
	}
	return res.json();
}

export async function getPrimaryTimezone(token) {
	if (!token) return 'UTC';
	const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) return 'UTC';
	const data = await res.json();
	return data?.value || 'UTC';
}
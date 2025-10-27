import { API_BASE_URL } from '../config';

function looksLikeGoogleToken(token) {
	if (!token) return false;
	if (token.startsWith('ya29.')) return true;
	try {
		if (token.split('.').length >= 2 && token.startsWith('eyJ')) {
			const payload = JSON.parse(atob(token.split('.')[1]));
			const iss = String(payload.iss || '').toLowerCase();
			if (iss.includes('accounts.google.com')) return true;
		}
	} catch (_) {}
	return false;
}

function looksLikeMicrosoftToken(token) {
	if (!token) return false;
	if (token.startsWith('Ew')) return true;
	try {
		if (token.split('.').length >= 2 && token.startsWith('eyJ')) {
			const payload = JSON.parse(atob(token.split('.')[1]));
			const iss = String(payload.iss || '').toLowerCase();
			if (iss.includes('login.microsoftonline.com') || iss.includes('sts.windows.net')) return true;
			const aud = String(payload.aud || '').toLowerCase();
			if (aud.includes('graph.microsoft.com')) return true;
		}
	} catch (_) {}
	return false;
}

function detectProvider(token) {
	if (looksLikeGoogleToken(token) && !looksLikeMicrosoftToken(token)) return 'google';
	if (looksLikeMicrosoftToken(token) && !looksLikeGoogleToken(token)) return 'microsoft';
	if (token && token.startsWith('ya29.')) return 'google';
	if (token && token.startsWith('Ew')) return 'microsoft';
	return 'google';
}

export async function getCalendarEvents(token, timeMin, timeMax, maxResults = 50) {
	if (!token) return { items: [] };
	const provider = detectProvider(token);

	if (provider === 'microsoft') {
		try {
			const res = await fetch(`${API_BASE_URL}/api/calendar/events`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					token,
					timeMin: timeMin || new Date().toISOString(),
					timeMax: timeMax || new Date(Date.now() + 7 * 864e5).toISOString(),
					maxResults
				})
			});
			if (!res.ok) {
				return { items: [] };
			}
			const data = await res.json();
			const items = (data.events || []).map(event => ({
				summary: event.title || 'Upptagen',
				start: { dateTime: event.start },
				end: { dateTime: event.end }
			}));
			return { items };
		} catch (_) {
			return { items: [] };
		}
	}

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
	if (detectProvider(token) === 'microsoft') {
		return { calendars: {} };
	}
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
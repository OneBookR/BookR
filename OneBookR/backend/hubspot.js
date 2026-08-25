// ===== HUBSPOT-INTEGRATION — SKICKAR DEMO-LEADS TILL CRM AUTOMATISKT =====
// Körs fire-and-forget från /api/book-demo/lead (så snart formuläret är
// ifyllt, inte bara vid faktisk bokning) — ett lead som fyller i formuläret
// men aldrig loggar in eller bokar ska ändå synas i HubSpot, annars tappar
// ni möjligheten att själva följa upp manuellt.
//
// Kräver miljövariabeln HUBSPOT_ACCESS_TOKEN (ett Private App access token
// från HubSpot, scope: crm.objects.contacts.write). Om den saknas loggas
// en varning en gång och funktionerna blir no-ops — integrationen är
// alltså helt valfri och kraschar aldrig resten av appen om den inte är
// konfigurerad.

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
let warnedMissingToken = false;

function getAccessToken() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token && !warnedMissingToken) {
    warnedMissingToken = true;
    console.warn('⚠️ HUBSPOT_ACCESS_TOKEN saknas — demo-leads skickas inte till HubSpot (integrationen är avstängd tills variabeln sätts).');
  }
  return token || null;
}

// ✅ Skapar (eller uppdaterar, om e-posten redan finns) en kontakt i
// HubSpot. Använder HubSpots "upsert by email"-mönster via
// /crm/v3/objects/contacts, med e-post som unikt idempotency-nyckel —
// samma lead som fyller i formuläret flera gånger skapar inte dubbletter.
async function upsertHubspotContact({ email, contactName, companyName, phone, leadId, provider }) {
  const token = getAccessToken();
  if (!token) return null;

  const [firstName, ...restName] = (contactName || '').trim().split(/\s+/);
  const lastName = restName.join(' ') || undefined;

  const properties = {
    email,
    firstname: firstName || undefined,
    lastname: lastName,
    company: companyName || undefined,
    phone: phone || undefined,
    // ✅ Egna properties — måste skapas manuellt i HubSpot först
    // (Settings → Properties → Contact properties) med dessa interna namn,
    // annars avvisar HubSpot requesten med ett 400-fel för okända fält.
    bookr_lead_id: leadId || undefined,
    bookr_login_provider: provider || undefined,
    bookr_lead_source: 'Boka demo (onebookr.se)'
  };
  // HubSpot vill inte ha undefined-värden i payloaden.
  Object.keys(properties).forEach((key) => {
    if (properties[key] === undefined) delete properties[key];
  });

  try {
    // Försök skapa kontakten först.
    const createRes = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });

    if (createRes.ok) {
      const data = await createRes.json();
      console.log(`✅ HubSpot: kontakt skapad (${data.id})`);
      return data.id;
    }

    // 409 = kontakten finns redan (samma e-post) — uppdatera den istället.
    if (createRes.status === 409) {
      const updateRes = await fetch(
        `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ properties })
        }
      );
      if (updateRes.ok) {
        const data = await updateRes.json();
        console.log(`✅ HubSpot: kontakt uppdaterad (${data.id})`);
        return data.id;
      }
      const updateErrorText = await updateRes.text();
      console.warn(`⚠️ HubSpot: kunde inte uppdatera befintlig kontakt: HTTP ${updateRes.status}: ${updateErrorText}`);
      return null;
    }

    const errorText = await createRes.text();
    console.warn(`⚠️ HubSpot: kunde inte skapa kontakt: HTTP ${createRes.status}: ${errorText}`);
    return null;
  } catch (err) {
    console.warn('⚠️ HubSpot-anrop misslyckades:', err.message);
    return null;
  }
}

export { upsertHubspotContact };

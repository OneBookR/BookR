// stripe-setup.mjs — skapar BookRs produkter och priser i Stripe (test- eller
// live-läge, avgörs av vilken nyckel du kör med) och skriver ut ett .env-block.
//
// Kör:
//   STRIPE_SECRET_KEY=sk_test_xxx node OneBookR/backend/scripts/stripe-setup.mjs
//
// Idempotent: hittar befintliga produkter/priser via metadata (bookr_plan /
// bookr_key) och återanvänder dem istället för att skapa dubbletter. Kör den
// hur många gånger du vill.
//
// Priser (SEK, i öre) — matchar prislogiken v3:
//   Pro         149 kr/mån   ·  1 428 kr/år
//   Business    229 kr/säte/mån  ·  2 148 kr/säte/år   (per_unit, quantity = säten)

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('❌ Sätt STRIPE_SECRET_KEY (sk_test_... eller sk_live_...) i miljön först.');
  process.exit(1);
}
const stripe = new Stripe(key);
const MODE = key.startsWith('sk_live_') ? 'LIVE' : 'TEST';

const PLANS = [
  {
    plan: 'pro',
    productName: 'BookR Pro',
    productDescription: 'Obegränsade sessioner, upp till 10 kalendrar per session, bokningssida med ditt namn, uppgiftshantering, prioriterad e-postsupport.',
    prices: [
      { key: 'pro_monthly', unit_amount: 14900, interval: 'month', nickname: 'Pro – månad' },
      { key: 'pro_yearly',  unit_amount: 142800, interval: 'year',  nickname: 'Pro – år' },
    ],
  },
  {
    plan: 'business',
    productName: 'BookR Business',
    productDescription: 'Allt i Pro plus upp till 20 deltagare per session, white-label bokningssida och centraliserad fakturering. Pris per säte, minst 3 säten.',
    prices: [
      { key: 'business_monthly', unit_amount: 22900, interval: 'month', nickname: 'Business – månad/säte', perSeat: true },
      { key: 'business_yearly',  unit_amount: 214800, interval: 'year',  nickname: 'Business – år/säte',   perSeat: true },
    ],
  },
];

async function findProduct(plan) {
  // Stripe har ingen "sök på metadata" i list — hämta aktiva produkter och filtrera.
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata?.bookr_plan === plan) return product;
  }
  return null;
}

async function findPrice(productId, bookrKey) {
  for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (price.metadata?.bookr_key === bookrKey) return price;
  }
  return null;
}

async function upsertProduct(def) {
  const existing = await findProduct(def.plan);
  if (existing) {
    console.log(`• Produkt finns: ${existing.name} (${existing.id})`);
    return existing;
  }
  const created = await stripe.products.create({
    name: def.productName,
    description: def.productDescription,
    metadata: { bookr_plan: def.plan },
  });
  console.log(`✓ Skapade produkt: ${created.name} (${created.id})`);
  return created;
}

async function upsertPrice(productId, def) {
  const existing = await findPrice(productId, def.key);
  if (existing) {
    console.log(`  • Pris finns: ${def.key} → ${existing.id}`);
    return existing;
  }
  const created = await stripe.prices.create({
    product: productId,
    currency: 'sek',
    unit_amount: def.unit_amount,
    nickname: def.nickname,
    recurring: {
      interval: def.interval,
      // per_unit + quantity = antal säten för Business; Pro har alltid quantity 1.
      usage_type: 'licensed',
    },
    billing_scheme: 'per_unit',
    metadata: { bookr_key: def.key },
  });
  console.log(`  ✓ Skapade pris: ${def.key} → ${created.id}`);
  return created;
}

async function main() {
  console.log(`\nStripe-setup för BookR — läge: ${MODE}\n`);
  const envLines = [];

  for (const def of PLANS) {
    const product = await upsertProduct(def);
    for (const priceDef of def.prices) {
      const price = await upsertPrice(product.id, priceDef);
      envLines.push(`STRIPE_PRICE_${priceDef.key.toUpperCase()}=${price.id}`);
    }
  }

  // Billing Portal-konfiguration (för /api/billing/portal). Skapa en default om
  // ingen finns — annars återanvänd. Portalen låter kunden byta plan, säga upp
  // och uppdatera betalkort utan att vi bygger UI för det.
  let portal;
  const portals = await stripe.billingPortal.configurations.list({ limit: 1 });
  if (portals.data.length > 0) {
    portal = portals.data[0];
    console.log(`\n• Billing Portal-config finns: ${portal.id}`);
  } else {
    portal = await stripe.billingPortal.configurations.create({
      business_profile: { headline: 'BookR — hantera din prenumeration' },
      features: {
        customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ['price', 'quantity'],
          products: 'all',
        },
      },
    });
    console.log(`\n✓ Skapade Billing Portal-config: ${portal.id}`);
  }

  console.log('\n─────────────────────────────────────────────');
  console.log('Klistra in i OneBookR/backend/.env (och Railway):\n');
  console.log(envLines.join('\n'));
  console.log(`\n# STRIPE_SECRET_KEY sätter du själv (${MODE}-nyckeln du körde med)`);
  console.log('# STRIPE_WEBHOOK_SECRET får du när du skapar webhook-endpointen (se nedan)');
  console.log('─────────────────────────────────────────────');
  console.log('\nNästa steg för webhooks:');
  console.log('  Lokalt:  stripe listen --forward-to localhost:3000/api/webhooks/stripe');
  console.log('           (skriver ut ett whsec_... — det är STRIPE_WEBHOOK_SECRET lokalt)');
  console.log('  Prod:    Stripe Dashboard → Developers → Webhooks → Add endpoint');
  console.log('           URL: https://www.onebookr.se/api/webhooks/stripe');
  console.log('           Events: checkout.session.completed, customer.subscription.updated,');
  console.log('                   customer.subscription.deleted, invoice.payment_failed\n');
}

main().catch((err) => {
  console.error('\n❌ Fel:', err.message);
  process.exit(1);
});

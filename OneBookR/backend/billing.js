// billing.js — Stripe-integration för BookR (prenumeration + kundportal).
// Ren Stripe-logik; Firestore-skrivningar sker i server.js webhook-handlern.
//
// Env som krävs (se .env.example):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY,
//   STRIPE_PRICE_BUSINESS_MONTHLY, STRIPE_PRICE_BUSINESS_YEARLY
// Saknas STRIPE_SECRET_KEY är hela billing-modulen en no-op (routes svarar 503).

import Stripe from 'stripe';

const SECRET = process.env.STRIPE_SECRET_KEY;
export const stripe = SECRET ? new Stripe(SECRET) : null;

// Minsta antal säten för Business (matchar prislogiken).
export const BUSINESS_MIN_SEATS = 3;

// price-id → { plan, period }, och (plan, period) → price-id.
const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_PRO_MONTHLY]:      { plan: 'pro', period: 'monthly' },
  [process.env.STRIPE_PRICE_PRO_YEARLY]:       { plan: 'pro', period: 'yearly' },
  [process.env.STRIPE_PRICE_BUSINESS_MONTHLY]: { plan: 'business', period: 'monthly' },
  [process.env.STRIPE_PRICE_BUSINESS_YEARLY]:  { plan: 'business', period: 'yearly' },
};

function priceIdFor(plan, period) {
  const key = `STRIPE_PRICE_${String(plan).toUpperCase()}_${period === 'yearly' ? 'YEARLY' : 'MONTHLY'}`;
  return process.env[key] || null;
}

export function isBillingConfigured() {
  return Boolean(stripe && priceIdFor('pro', 'monthly') && priceIdFor('business', 'monthly'));
}

// ===== CHECKOUT =====
// Skapar en Stripe Checkout Session för en prenumeration. Returnerar URL:en
// besökaren ska skickas till. Business använder adjustable_quantity så köparen
// väljer antal säten direkt i checkouten (min 3) utan att vi bygger team-UI.
export async function createCheckoutSession({ email, plan, period, successUrl, cancelUrl }) {
  if (!isBillingConfigured()) throw new Error('billing_not_configured');
  if (!['pro', 'business'].includes(plan)) throw new Error('invalid_plan');
  if (!['monthly', 'yearly'].includes(period)) throw new Error('invalid_period');

  const price = priceIdFor(plan, period);
  if (!price) throw new Error('price_not_found');

  const isBusiness = plan === 'business';
  const lineItem = isBusiness
    ? { price, quantity: BUSINESS_MIN_SEATS, adjustable_quantity: { enabled: true, minimum: BUSINESS_MIN_SEATS, maximum: 500 } }
    : { price, quantity: 1 };

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [lineItem],
    customer_email: email,
    client_reference_id: email,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    subscription_data: {
      metadata: { bookr_email: email, bookr_plan: plan },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session.url;
}

// ===== KUNDPORTAL =====
export async function createPortalSession({ customerId, returnUrl }) {
  if (!stripe) throw new Error('billing_not_configured');
  if (!customerId) throw new Error('no_customer');
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

// ===== WEBHOOK =====
export function constructWebhookEvent(rawBody, signature) {
  if (!stripe) throw new Error('billing_not_configured');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('missing_webhook_secret');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// Läser ut BookR-relevant status ur ett Stripe subscription-objekt.
export function interpretSubscription(subscription) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id;
  const mapped = PRICE_TO_PLAN[priceId] || {};
  // status: active/trialing = betald; past_due/unpaid = kvar men varning;
  // canceled/incomplete_expired = tillbaka till free.
  const active = ['active', 'trialing', 'past_due'].includes(subscription.status);
  // current_period_end flyttade från subscription-objektet till item-nivå i
  // nyare Stripe-API-versioner — kolla båda.
  const periodEndUnix = subscription.current_period_end || item?.current_period_end || null;
  return {
    plan: active ? (mapped.plan || 'pro') : 'free',
    period: mapped.period || null,
    billingStatus: subscription.status,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripeSubscriptionId: subscription.id,
    billingPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    seats: item?.quantity || 1,
  };
}

// Hämtar e-posten en subscription hör till (metadata först, annars kundens mejl).
export async function emailForSubscription(subscription) {
  const metaEmail = subscription.metadata?.bookr_email;
  if (metaEmail) return metaEmail.toLowerCase().trim();
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (customerId && stripe) {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer && !customer.deleted && customer.email) return customer.email.toLowerCase().trim();
  }
  return null;
}

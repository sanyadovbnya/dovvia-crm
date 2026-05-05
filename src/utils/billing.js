import { supabase } from '../lib/supabase'
import { getSession } from './auth'

// Frontend wrapper around the three Stripe edge functions:
//   stripe-checkout — opens a hosted Checkout session for a chosen plan
//   stripe-portal   — opens the Customer Portal so the user can update
//                     their card, view invoices, cancel, change plan
//   (stripe-webhook is invoked by Stripe directly — never from the browser)
//
// The browser never sees the Stripe API key. Edge functions read it from
// the STRIPE_SECRET_KEY env var on Supabase.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY

// Display-friendly plan metadata. Keys MUST match the keys
// stripe-checkout/index.ts uses to look up Stripe Price IDs.
export const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: 149,
    sub: '/month',
    features: [
      '1 phone number',
      '1 location',
      'Up to 150 calls/month',
      'Live dashboard + SMS follow-up',
      'Email notifications',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 349,
    sub: '/month',
    highlight: true,
    features: [
      'Unlimited calls',
      '1 location',
      'Stripe invoicing',
      'SMS follow-up',
      'Priority support',
    ],
  },
  {
    key: 'multi-shop',
    name: 'Multi-shop',
    price: 799,
    sub: '/month',
    features: [
      'Up to 3 locations',
      'Multi-location dashboard',
      'Dedicated account manager',
      '+$200/each additional location',
    ],
  },
]

export const PLAN_BY_KEY = Object.fromEntries(PLANS.map(p => [p.key, p]))

// Statuses that should let the user into the dashboard. past_due is
// included on purpose — Stripe keeps retrying the card for a few days,
// and we don't want to lock out a customer the moment a card declines.
// The webhook will demote them to canceled/unpaid eventually if it
// truly fails.
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

export function isSubscriptionActive(billing) {
  if (!billing) return false
  return ACTIVE_STATUSES.has(billing.subscription_status)
}

// Reads the tenant's billing state from the profiles mirror. The mirror
// is kept in sync by the stripe-webhook edge function.
export async function loadBilling() {
  const session = await getSession()
  if (!session) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_plan, current_period_end, stripe_customer_id')
    .eq('id', session.user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Asks the stripe-checkout function for a hosted Checkout URL and returns
// it. Caller is expected to set window.location.href = url.
export async function startCheckout(planKey) {
  const session = await getSession()
  if (!session) throw new Error('not authenticated')
  const r = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan: planKey }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.ok) throw new Error(data?.error || `checkout failed (${r.status})`)
  return data.url
}

// Asks the stripe-portal function for a Customer Portal URL.
export async function openBillingPortal() {
  const session = await getSession()
  if (!session) throw new Error('not authenticated')
  const r = await fetch(`${SUPABASE_URL}/functions/v1/stripe-portal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.ok) throw new Error(data?.error || `portal failed (${r.status})`)
  return data.url
}

// Creates a Stripe Checkout Session combining the one-time setup fee with
// the chosen recurring plan. Returns the hosted-checkout URL; the frontend
// redirects the browser to it. We never see the customer's card.
//
// Auth: caller must pass their Supabase JWT via Authorization: Bearer …
// We resolve the user from that token, find-or-create their Stripe
// Customer, and open the Checkout session in their context.
//
// Pricing model: setup fee ($500) is a one-time line item appended to
// every subscription Checkout. Stripe handles this natively — first
// invoice = setup + first month, subsequent invoices = monthly only.
//
// Promotion codes: allow_promotion_codes=true so customers can paste the
// FOUNDER coupon ("25% off forever, max 5 redemptions") at checkout.
// The coupon is configured against the recurring price only in Stripe,
// so the setup fee is not discounted.
//
// Deploy: supabase functions deploy stripe-checkout

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Hard-coded Stripe Price IDs. These are NOT secrets (visible on every
// Checkout page), but typos would silently break Checkout. Keep aligned
// with Stripe Dashboard → Products.
const PRICE_SETUP   = 'price_1TTUTPK2QsCqT7BRURqd4CJl'  // $500 one-time
const PRICE_STARTER = 'price_1TTUUEK2QsCqT7BRg2hYLYDk'  // $149/mo
const PRICE_PRO     = 'price_1TTUUeK2QsCqT7BRYlWk7ZBv'  // $349/mo
const PRICE_MULTI   = 'price_1TTUVQK2QsCqT7BRdYlYnKUj'  // $799/mo

const PLAN_PRICES: Record<string, string> = {
  starter:      PRICE_STARTER,
  pro:          PRICE_PRO,
  'multi-shop': PRICE_MULTI,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')   return json({ ok: false, error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')
  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY')
  const appUrl      = Deno.env.get('APP_URL') || 'https://app.getdovvia.com'
  if (!supabaseUrl || !serviceKey || !anonKey || !stripeKey) {
    return json({ ok: false, error: 'server not configured' }, 500)
  }

  // Resolve user from JWT (anon-key client + bearer header)
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return json({ ok: false, error: 'missing user token' }, 401)
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401)
  const user = userData.user

  // Parse and validate body
  let body: { plan?: string; includeSetup?: boolean }
  try { body = await req.json() } catch { return json({ ok: false, error: 'invalid json' }, 400) }

  const planKey = (body.plan || '').toLowerCase()
  const planPrice = PLAN_PRICES[planKey]
  if (!planPrice) return json({ ok: false, error: `invalid plan: ${planKey}` }, 400)
  const includeSetup = body.includeSetup !== false  // default true

  // Service-role client for profile read/write (RLS bypass)
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

  // Find or create the Stripe Customer for this tenant. Idempotent —
  // a second call reuses the existing id. We store the id so the webhook
  // can look up the tenant from incoming Stripe events.
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('stripe_customer_id, shop_name')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) return json({ ok: false, error: profileErr.message }, 500)

  let customerId = profile?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name:  profile?.shop_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await sb.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  // Setup fee first so it shows on top of the Checkout receipt.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
  if (includeSetup) lineItems.push({ price: PRICE_SETUP, quantity: 1 })
  lineItems.push({ price: planPrice, quantity: 1 })

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    // Lets customers paste FOUNDER (25% off forever, 5 redemptions max)
    // at checkout. Stripe scopes it to recurring items automatically.
    allow_promotion_codes: true,
    success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/subscribe?checkout=cancel`,
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        plan: planKey,
      },
    },
    // Tax automatically computed if Stripe Tax is enabled in dashboard.
    automatic_tax: { enabled: false },
  })

  return json({ ok: true, url: session.url })
})

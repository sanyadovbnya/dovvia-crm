// Returns a Stripe Customer Portal session URL so the user can manage
// their subscription on Stripe-hosted pages: update card, view invoices,
// cancel, change plan, etc. We don't want to build any of that ourselves
// — Stripe's portal is PCI-compliant and updated for free.
//
// Auth: requires the caller's Supabase JWT. We resolve the user, look
// up their stripe_customer_id, and ask Stripe to mint a portal session
// keyed to that customer.
//
// Deploy: supabase functions deploy stripe-portal

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

  // Auth — resolve the caller from JWT
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

  // Look up the Stripe Customer for this tenant
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) return json({ ok: false, error: profileErr.message }, 500)
  if (!profile?.stripe_customer_id) {
    return json({ ok: false, error: 'no billing account yet — subscribe first' }, 400)
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/dashboard`,
  })

  return json({ ok: true, url: session.url })
})

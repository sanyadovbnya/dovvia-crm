// Listens for Stripe events that change a subscription's state and
// mirrors them onto profiles.subscription_status / subscription_plan /
// current_period_end. Stripe is the source of truth; the frontend reads
// our mirror to decide whether to render the dashboard or the paywall.
//
// Configure in Stripe Dashboard → Developers → Webhooks:
//   Endpoint URL:    https://<project>.supabase.co/functions/v1/stripe-webhook
//   Events to send:
//     checkout.session.completed
//     customer.subscription.created
//     customer.subscription.updated
//     customer.subscription.deleted
//     invoice.payment_failed
//     invoice.payment_succeeded
//   After saving, copy the "Signing secret" (whsec_…) and store it as
//   STRIPE_WEBHOOK_SECRET in Supabase → Edge Functions → Secrets.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// (Stripe doesn't send Supabase JWTs, just its own signature.)

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function ok(body: unknown = { received: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Map a Stripe Price ID back to our internal plan key. Used to populate
// profiles.subscription_plan whenever the active subscription changes
// (upgrade, downgrade, plan change in Customer Portal). Price IDs live
// in env vars so test-mode and live-mode share this code unchanged.
function buildPriceToPlan(): Record<string, string> {
  const map: Record<string, string> = {}
  const starter = Deno.env.get('STRIPE_PRICE_STARTER')
  const pro     = Deno.env.get('STRIPE_PRICE_PRO')
  const multi   = Deno.env.get('STRIPE_PRICE_MULTI')
  if (starter) map[starter] = 'starter'
  if (pro)     map[pro]     = 'pro'
  if (multi)   map[multi]   = 'multi-shop'
  return map
}

function priceIdToPlan(priceId: string | undefined, table: Record<string, string>): string | null {
  if (!priceId) return null
  return table[priceId] ?? null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'method not allowed' }, 405)

  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return ok({ error: 'server not configured' }, 500)
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const PRICE_TO_PLAN = buildPriceToPlan()

  // Stripe signature is computed against the raw body — we MUST read the
  // body as text and pass it verbatim, not parse-and-restringify.
  const sig = req.headers.get('stripe-signature') || ''
  const raw = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret)
  } catch (e) {
    console.log('[stripe-webhook] signature verification failed:', (e as Error).message)
    return ok({ error: 'bad signature' }, 400)
  }

  console.log('[stripe-webhook] event', { type: event.type, id: event.id })

  try {
    switch (event.type) {
      // Subscription lifecycle. We could probably skip
      // checkout.session.completed (the subsequent customer.subscription.created
      // covers the same state change), but mirroring early gives the UI a
      // faster transition out of the paywall.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        // The session has the subscription id but not the full status.
        // Mark active optimistically; subscription.updated will confirm.
        if (customerId) {
          await sb.from('profiles')
            .update({ subscription_status: 'active' })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      // The canonical lifecycle events. Stripe fires these on:
      //   - new subscription created (Checkout)
      //   - plan changed (Customer Portal upgrade / downgrade)
      //   - payment-state transitions (active → past_due → unpaid)
      //   - cancellation (set cancel_at_period_end OR immediate)
      //   - reactivation
      //
      // Reading from sub.status keeps us in sync with whatever Stripe says,
      // even for transitions we didn't explicitly subscribe to.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const priceId   = sub.items.data[0]?.price?.id
        const planKey   = priceIdToPlan(priceId, PRICE_TO_PLAN)
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null

        // For "deleted" Stripe still sends a Subscription object with
        // status: 'canceled'; we just mirror it.
        const updates: Record<string, unknown> = {
          subscription_status: sub.status,
          current_period_end: periodEnd,
        }
        if (planKey) updates.subscription_plan = planKey

        const { error } = await sb.from('profiles')
          .update(updates)
          .eq('stripe_customer_id', customerId)
        if (error) console.log('[stripe-webhook] profile update failed:', error.message)
        break
      }

      // Payment events — useful for surfacing past_due in the UI even if
      // the subscription.updated event hasn't fired yet, and for renewing
      // current_period_end on successful retries.
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        if (customerId) {
          await sb.from('profiles')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        // Refresh from the subscription so we capture the new period_end.
        const subId = (invoice as Stripe.Invoice & { subscription?: string }).subscription
        if (customerId && subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          await sb.from('profiles')
            .update({
              subscription_status: sub.status,
              current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
            })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      default:
        // Ignore — there are dozens of Stripe event types and we only
        // care about the ones above. Returning 200 tells Stripe not to
        // retry.
        break
    }
  } catch (e) {
    console.log('[stripe-webhook] handler error:', (e as Error).message)
    // Still return 200 — we don't want Stripe retrying a request that
    // hit a bug in our code (it'd just hit the same bug again). The
    // log above gives us what we need to fix it.
  }

  return ok()
})

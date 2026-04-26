// Public review endpoint hit by the React review page (no auth).
//
// GET  /review?token=...           → returns { ok, review: { customer_name, shop_name, google_review_url, submitted_at } }
// POST /review  { token, rating, feedback }  → records the review, returns
//                                              { ok, redirect_url? } where redirect_url is the Google review
//                                              page if rating >= 4 and the owner has one configured.
//
// Deploy: supabase functions deploy review --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Pull token from query string OR body
  const url = new URL(req.url)
  let token = url.searchParams.get('token') || ''
  let rating: number | null = null
  let feedback: string | null = null

  if (req.method === 'POST') {
    try {
      const body = await req.json()
      token = token || body?.token || ''
      rating = body?.rating != null ? Number(body.rating) : null
      feedback = body?.feedback ? String(body.feedback).slice(0, 4000) : null
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400)
    }
  }

  if (!token) return json({ ok: false, error: 'missing token' }, 400)

  // Look up the review + the owner's profile (shop name + google review url)
  const { data: review, error } = await supabase
    .from('reviews')
    .select('id, user_id, customer_name, rating, submitted_at, redirected_to_google')
    .eq('token', token)
    .maybeSingle()

  if (error)  return json({ ok: false, error: error.message }, 500)
  if (!review) return json({ ok: false, error: 'not found' }, 404)

  const { data: profile } = await supabase
    .from('profiles')
    .select('shop_name, google_review_url')
    .eq('id', review.user_id)
    .maybeSingle()

  // GET → return public-safe info to render the page
  if (req.method === 'GET') {
    return json({
      ok: true,
      review: {
        customer_name: review.customer_name,
        rating: review.rating,
        submitted_at: review.submitted_at,
      },
      shop_name: profile?.shop_name || 'this business',
      google_review_url: profile?.google_review_url || null,
    })
  }

  // POST → record the rating
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
  if (review.submitted_at) return json({ ok: false, error: 'already submitted' }, 409)
  if (!Number.isFinite(rating) || rating! < 1 || rating! > 5) {
    return json({ ok: false, error: 'rating must be 1-5' }, 400)
  }

  const wantsGoogle = (rating! >= 4) && Boolean(profile?.google_review_url)

  const { error: updErr } = await supabase
    .from('reviews')
    .update({
      rating,
      feedback,
      submitted_at: new Date().toISOString(),
      redirected_to_google: wantsGoogle,
    })
    .eq('id', review.id)

  if (updErr) return json({ ok: false, error: updErr.message }, 500)

  return json({
    ok: true,
    rating,
    redirect_url: wantsGoogle ? profile!.google_review_url : null,
  })
})

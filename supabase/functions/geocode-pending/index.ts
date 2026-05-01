// Batch-geocodes appointments that have an address but no lat/lng yet.
// Drives the Map page — first run on a tenant, the page kicks this off
// and pins start landing as the function works through the backlog.
//
// Strategy
//   - Pulls up to BATCH_SIZE pending rows for the calling user.
//   - For each, calls Nominatim (OSM's free geocoder) with a 1.1-second
//     pause between requests (Nominatim asks for ≤ 1 req/sec; we leave
//     a tiny buffer). Updates the row in place with lat/lng or marks
//     it 'no_match' / 'error' so we don't keep retrying broken inputs.
//   - Returns { processed, geocoded, remaining } so the frontend can
//     re-invoke until remaining === 0 (call this in a loop, no cron
//     needed).
//
// Auth: requires the caller's Supabase JWT. We only ever touch rows
// owned by that user. Service-role client is used internally to write
// through RLS, but the user identity gates which rows we read.
//
// Deploy: supabase functions deploy geocode-pending

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

// Process at most this many addresses per invocation. Each takes ~1.1s
// (Nominatim rate limit), so 25 addresses = ~28 seconds — safely under
// Supabase's edge-function timeout. Frontend re-invokes until done.
const BATCH_SIZE = 25
const NOMINATIM_DELAY_MS = 1100
// Nominatim asks for a real User-Agent identifying the application.
const USER_AGENT = 'Dovvia CRM (https://app.getdovvia.com)'

type Geocode = {
  status: 'ok' | 'no_match' | 'error'
  lat?: number
  lng?: number
}

async function geocode(address: string): Promise<Geocode> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', address)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'us')  // bias toward US results
  try {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } })
    if (!r.ok) return { status: 'error' }
    const data = await r.json()
    if (!Array.isArray(data) || data.length === 0) return { status: 'no_match' }
    const lat = Number(data[0].lat)
    const lng = Number(data[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'no_match' }
    return { status: 'ok', lat, lng }
  } catch {
    return { status: 'error' }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')   return json({ ok: false, error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ ok: false, error: 'server not configured' }, 500)
  }

  // Resolve the calling user from their bearer token.
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
  const userId = userData.user.id

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Pull a batch of pending rows.
  const { data: pending, error: pendingErr } = await sb
    .from('appointments')
    .select('id, customer_address')
    .eq('user_id', userId)
    .is('lat', null)
    .is('geocode_status', null)
    .not('customer_address', 'is', null)
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (pendingErr) return json({ ok: false, error: pendingErr.message }, 500)
  if (!pending || pending.length === 0) {
    return json({ ok: true, processed: 0, geocoded: 0, remaining: 0 })
  }

  let geocoded = 0
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]
    const address = (row.customer_address || '').trim()
    if (!address) {
      await sb.from('appointments')
        .update({ geocode_status: 'no_match', geocoded_at: new Date().toISOString() })
        .eq('id', row.id).eq('user_id', userId)
      continue
    }
    const result = await geocode(address)
    const update: Record<string, unknown> = {
      geocode_status: result.status,
      geocoded_at: new Date().toISOString(),
    }
    if (result.status === 'ok') {
      update.lat = result.lat
      update.lng = result.lng
      geocoded++
    }
    await sb.from('appointments').update(update).eq('id', row.id).eq('user_id', userId)
    // Throttle except on the last iteration.
    if (i < pending.length - 1) await sleep(NOMINATIM_DELAY_MS)
  }

  // Count what's still pending so the caller knows whether to re-invoke.
  const { count: remaining } = await sb
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('lat', null)
    .is('geocode_status', null)
    .not('customer_address', 'is', null)

  return json({
    ok: true,
    processed: pending.length,
    geocoded,
    remaining: remaining || 0,
  })
})

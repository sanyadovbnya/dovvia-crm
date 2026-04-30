// Receives Forminator (or any) webhook submissions and inserts them as a
// "waiting" lead for the tenant whose lead_intake_secret matches the
// X-Lead-Secret header.
//
// Deploy: supabase functions deploy intake-lead --no-verify-jwt
// Required secrets:
//   SUPABASE_URL                (auto-populated)
//   SUPABASE_SERVICE_ROLE_KEY   (auto-populated)
//
// Forminator → Settings → Integrations → Webhook
//   URL:     https://<project-ref>.functions.supabase.co/intake-lead
//   Method:  POST
//   Headers: X-Lead-Secret: <user's lead_intake_secret>
//   Body (JSON):
//     {
//       "name":   "{name-1}",
//       "email":  "{email-1}",
//       "phone":  "{phone-1}",
//       "details":"{textarea-1}"
//     }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lead-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Forminator sometimes posts form-encoded payloads instead of JSON. Accept
// both, plus the common alternate field names so we don't need a perfectly
// shaped form to start receiving leads.
async function readPayload(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try { return (await req.json()) ?? {} } catch { return {} }
  }
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const out: Record<string, string> = {}
    for (const [k, v] of form.entries()) out[k] = String(v)
    return out
  }
  // Last resort: try JSON anyway
  try { return (await req.json()) ?? {} } catch { return {} }
}

function pick(payload: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = payload[k]
    if (v && String(v).trim()) return String(v).trim()
  }
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  const secret = req.headers.get('x-lead-secret')
  if (!secret) return json({ ok: false, error: 'missing X-Lead-Secret header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'server not configured' }, 500)
  }

  // Service-role client: bypasses RLS so we can resolve tenant by secret and
  // insert the lead row attributed to that user.
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('id')
    .eq('lead_intake_secret', secret)
    .maybeSingle()

  if (profileErr) return json({ ok: false, error: profileErr.message }, 500)
  if (!profile)   return json({ ok: false, error: 'invalid secret' }, 401)

  const payload = await readPayload(req)

  const name    = pick(payload, ['name', 'full_name', 'fullname', 'Name'])
  const email   = pick(payload, ['email', 'Email'])
  const phone   = pick(payload, ['phone', 'phone_number', 'Phone'])
  const details = pick(payload, ['details', 'message', 'description', 'notes', 'textarea-1'])

  if (!name && !email && !phone) {
    return json({ ok: false, error: 'no contact fields supplied' }, 400)
  }

  const { data, error } = await sb
    .from('leads')
    .insert({
      user_id: profile.id,
      name:    name    || null,
      email:   email   || null,
      phone:   phone   || null,
      details: details || null,
      source:  'web',
      status:  'waiting',
    })
    .select('id')
    .single()

  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true, id: data.id })
})

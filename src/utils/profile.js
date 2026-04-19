import { supabase } from '../lib/supabase'

async function session() {
  const { data: { session: s } } = await supabase.auth.getSession()
  return s
}

export async function loadProfile() {
  const s = await session()
  if (!s) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('vapi_key, shop_name, twilio_account_sid, twilio_auth_token, twilio_from_number')
    .eq('id', s.user.id)
    .single()
  if (error?.code === 'PGRST116') {
    await supabase.from('profiles').insert({ id: s.user.id })
    return { vapi_key: '', shop_name: '', twilio_account_sid: '', twilio_auth_token: '', twilio_from_number: '' }
  }
  if (error || !data) return null
  return data
}

export async function loadVapiKey() {
  const p = await loadProfile()
  return p?.vapi_key || ''
}

export async function saveVapiKey(key) {
  const s = await session()
  if (!s) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('profiles')
    .update({ vapi_key: key, updated_at: new Date().toISOString() })
    .eq('id', s.user.id)
  if (error) throw new Error(error.message)
}

export async function loadTwilioConfig() {
  const p = await loadProfile()
  return {
    shop_name:          p?.shop_name || '',
    twilio_account_sid: p?.twilio_account_sid || '',
    twilio_from_number: p?.twilio_from_number || '',
    has_auth_token:     Boolean(p?.twilio_auth_token),
  }
}

// Accepts { shop_name, twilio_account_sid, twilio_from_number, twilio_auth_token }.
// twilio_auth_token is only updated if provided (non-empty); otherwise the existing
// stored token is kept, so the user doesn't need to re-enter it every edit.
export async function saveTwilioConfig(cfg) {
  const s = await session()
  if (!s) throw new Error('Not authenticated')
  const payload = {
    shop_name: cfg.shop_name || null,
    twilio_account_sid: cfg.twilio_account_sid || null,
    twilio_from_number: cfg.twilio_from_number || null,
    updated_at: new Date().toISOString(),
  }
  if (cfg.twilio_auth_token) payload.twilio_auth_token = cfg.twilio_auth_token
  const { error } = await supabase.from('profiles').update(payload).eq('id', s.user.id)
  if (error) throw new Error(error.message)
}

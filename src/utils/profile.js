import { supabase } from '../lib/supabase'

export async function loadVapiKey() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return ''
  const { data, error } = await supabase
    .from('profiles')
    .select('vapi_key')
    .eq('id', session.user.id)
    .single()
  if (error?.code === 'PGRST116') {
    await supabase.from('profiles').insert({ id: session.user.id })
    return ''
  }
  if (error || !data) return ''
  return data.vapi_key || ''
}

export async function saveVapiKey(key) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('profiles')
    .update({ vapi_key: key, updated_at: new Date().toISOString() })
    .eq('id', session.user.id)
  if (error) throw new Error(error.message)
}

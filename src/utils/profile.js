import { supabase } from '../lib/supabase'
import { getSession } from './auth'

export async function loadProfile() {
  const s = await getSession()
  if (!s) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', s.user.id)
    .single()
  if (error?.code === 'PGRST116') {
    const { error: insertErr } = await supabase.from('profiles').insert({ id: s.user.id })
    // Ignore unique-violation: a row inserted by a concurrent call is fine.
    if (insertErr && insertErr.code !== '23505') throw new Error(insertErr.message)
    return {
      vapi_key: '', shop_name: '',
      twilio_account_sid: '', twilio_auth_token: '', twilio_from_number: '',
      business_address: '', business_email: '', business_website: '',
      invoice_default_tax_rate: null, invoice_next_number: 1001,
      invoice_footer: 'Thank you for your business!',
      google_review_url: '',
      invoice_email_subject: '', invoice_email_body: '',
    }
  }
  if (error || !data) return null
  return data
}

export async function loadVapiKey() {
  const p = await loadProfile()
  return p?.vapi_key || ''
}

export async function saveVapiKey(key) {
  const s = await getSession()
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

export const DEFAULT_INVOICE_EMAIL_SUBJECT = 'Invoice #{{invoice_number}} from {{shop_name}}'
export const DEFAULT_INVOICE_EMAIL_BODY = `Hi {{customer_first_name}},

Here's your invoice for the {{serviced_unit}} completed on {{service_date}}.

View / download: {{invoice_pdf_url}}

Total: {{total}}

Please let me know if you have any questions.

Thank you,
{{shop_name}}
{{business_email}}
{{business_website}}`

export async function loadInvoiceConfig() {
  const p = await loadProfile()
  return {
    business_address:         p?.business_address || '',
    business_email:           p?.business_email || '',
    business_website:         p?.business_website || '',
    business_logo_url:        p?.business_logo_url || '',
    invoice_default_tax_rate: p?.invoice_default_tax_rate ?? '',
    invoice_next_number:      p?.invoice_next_number ?? 1001,
    invoice_footer:           p?.invoice_footer || 'Thank you for your business!',
    google_review_url:        p?.google_review_url || '',
    invoice_email_subject:    p?.invoice_email_subject || DEFAULT_INVOICE_EMAIL_SUBJECT,
    invoice_email_body:       p?.invoice_email_body || DEFAULT_INVOICE_EMAIL_BODY,
  }
}

export async function saveInvoiceConfig(cfg) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const base = {
    business_address:         cfg.business_address || null,
    business_email:           cfg.business_email || null,
    business_website:         cfg.business_website || null,
    business_logo_url:        cfg.business_logo_url || null,
    invoice_default_tax_rate: cfg.invoice_default_tax_rate === '' || cfg.invoice_default_tax_rate == null
      ? null : Number(cfg.invoice_default_tax_rate),
    invoice_next_number:      cfg.invoice_next_number ? Number(cfg.invoice_next_number) : 1001,
    invoice_footer:           cfg.invoice_footer || null,
    google_review_url:        cfg.google_review_url || null,
    updated_at: new Date().toISOString(),
  }
  const withEmail = {
    ...base,
    invoice_email_subject: cfg.invoice_email_subject || null,
    invoice_email_body:    cfg.invoice_email_body || null,
  }
  let { error } = await supabase.from('profiles').update(withEmail).eq('id', s.user.id)
  // If migration 0009 hasn't been applied yet, the email columns don't exist.
  // Retry without them so the rest of the settings still save.
  if (error && /invoice_email_/i.test(error.message)) {
    ({ error } = await supabase.from('profiles').update(base).eq('id', s.user.id))
    if (!error) {
      throw new Error('Saved everything except email template — run migration 0009 in Supabase to enable saving the email template.')
    }
  }
  if (error) throw new Error(error.message)
}

// Accepts { shop_name, twilio_account_sid, twilio_from_number, twilio_auth_token }.
// twilio_auth_token is only updated if provided (non-empty); otherwise the existing
// stored token is kept, so the user doesn't need to re-enter it every edit.
export async function saveTwilioConfig(cfg) {
  const s = await getSession()
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

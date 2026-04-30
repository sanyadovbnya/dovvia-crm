import { supabase } from '../lib/supabase'

async function session() {
  const { data: { session: s } } = await supabase.auth.getSession()
  return s
}

export function fmtUSD(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '$0.00'
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function recompute(line_items, tax_rate) {
  const subtotal = (line_items || []).reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const tax = subtotal * (Number(tax_rate) || 0) / 100
  const total = subtotal + tax
  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax_amount: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
  }
}

export async function fetchInvoices() {
  const s = await session()
  if (!s) return []
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', s.user.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function fetchInvoice(id) {
  const s = await session()
  if (!s) return null
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', s.user.id)
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Atomically reads + bumps the user's invoice_next_number on profiles.
async function nextInvoiceNumber(userId) {
  const { data: prof } = await supabase
    .from('profiles')
    .select('invoice_next_number')
    .eq('id', userId)
    .single()
  const n = prof?.invoice_next_number || 1001
  await supabase
    .from('profiles')
    .update({ invoice_next_number: n + 1, updated_at: new Date().toISOString() })
    .eq('id', userId)
  return n
}

export async function createInvoice(invoice) {
  const s = await session()
  if (!s) throw new Error('Not authenticated')
  const totals = recompute(invoice.line_items, invoice.tax_rate)
  const number = invoice.invoice_number || (await nextInvoiceNumber(s.user.id))
  const payload = {
    user_id: s.user.id,
    appointment_id: invoice.appointment_id || null,
    invoice_number: number,
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email || null,
    customer_phone: invoice.customer_phone || null,
    customer_address: invoice.customer_address || null,
    serviced_unit: invoice.serviced_unit || null,
    service_date: invoice.service_date,
    line_items: invoice.line_items || [],
    tax_rate: Number(invoice.tax_rate) || 0,
    notes: invoice.notes || null,
    status: invoice.status || 'draft',
    ...totals,
  }
  const { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateInvoice(id, patch) {
  const s = await session()
  if (!s) throw new Error('Not authenticated')
  const totals = patch.line_items
    ? recompute(patch.line_items, patch.tax_rate ?? 0)
    : {}
  const { data, error } = await supabase
    .from('invoices')
    .update({ ...patch, ...totals, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', s.user.id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function markSent(id) {
  return updateInvoice(id, { status: 'sent', sent_at: new Date().toISOString() })
}

export async function markPaid(id) {
  return updateInvoice(id, { status: 'paid', paid_at: new Date().toISOString() })
}

export async function deleteInvoice(id) {
  const s = await session()
  if (!s) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', s.user.id)
  if (error) throw new Error(error.message)
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Send free-form notes (any language) to the parse-invoice edge function and
// get back a structured invoice draft.
export async function aiParseInvoice(text) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-invoice`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw new Error(data?.error || `AI parse failed (${res.status})`)
  }
  return data.invoice
}

// Variables exposed to the email subject + body templates. Placeholder syntax
// is {{name}}. Unknown placeholders are left intact so users see typos.
export function emailTemplateVars(invoice, profile) {
  const firstName = (invoice.customer_name || '').trim().split(/\s+/)[0] || 'there'
  const serviceDate = invoice.service_date
    ? new Date(invoice.service_date + 'T00:00').toLocaleDateString('en-US')
    : ''
  return {
    customer_name:        invoice.customer_name || '',
    customer_first_name:  firstName,
    customer_email:       invoice.customer_email || '',
    customer_phone:       invoice.customer_phone || '',
    customer_address:     invoice.customer_address || '',
    invoice_number:       invoice.invoice_number || '',
    serviced_unit:        invoice.serviced_unit || 'service',
    service_date:         serviceDate,
    subtotal:             fmtUSD(invoice.subtotal),
    tax_amount:           fmtUSD(invoice.tax_amount),
    total:                fmtUSD(invoice.total),
    notes:                invoice.notes || '',
    shop_name:            profile?.shop_name || 'Our shop',
    business_email:       profile?.business_email || '',
    business_website:     profile?.business_website || '',
    business_phone:       profile?.twilio_from_number || '',
    business_address:     profile?.business_address || '',
  }
}

export const EMAIL_TEMPLATE_PLACEHOLDERS = [
  'customer_first_name', 'customer_name', 'customer_email', 'customer_phone', 'customer_address',
  'invoice_number', 'serviced_unit', 'service_date', 'subtotal', 'tax_amount', 'total', 'notes',
  'shop_name', 'business_email', 'business_website', 'business_phone', 'business_address',
]

export function applyTemplate(template, vars) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m
  )
}

export function buildGmailCompose(invoice, profile, { subject, body } = {}) {
  const vars = emailTemplateVars(invoice, profile)
  const filledSubject = applyTemplate(subject || '', vars)
  const filledBody = applyTemplate(body || '', vars)
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: invoice.customer_email || '',
    su: filledSubject,
    body: filledBody,
  })
  return `https://mail.google.com/mail/?${params.toString()}`
}

import { supabase } from '../lib/supabase'
import { getSession } from './auth'

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
  const s = await getSession()
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
  const s = await getSession()
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
  const s = await getSession()
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
  const s = await getSession()
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
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', s.user.id)
  if (error) throw new Error(error.message)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Builds an invoice prefill draft from a grouped customer record.
// Used when "Generate Invoice" is clicked from the Customer detail panel.
export function buildInvoiceDraftFromCustomer(customer) {
  const topService = Object.entries(customer.services || {})
    .sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const lastAppt = customer.appointments?.[0]
  return {
    customer_name: customer.name || '',
    customer_phone: customer.phone || customer.callerPhone || '',
    customer_address: customer.address || '',
    serviced_unit: topService,
    service_date: lastAppt?.date || todayStr(),
  }
}

// Builds an invoice prefill draft from a Vapi call + its (optional) resolution.
// If outcome is "done" with a work_description/amount, those become a line item.
// The call's reported problem is folded into notes for context.
export function buildInvoiceDraftFromCall(call, outputs, resolution) {
  const callerId = call.customer?.number
  const draft = {
    customer_name: outputs.customerName || callerId || '',
    customer_phone: outputs.customerPhone || callerId || '',
    customer_address: outputs.customerAddress || '',
    serviced_unit: outputs.serviceType || '',
    service_date: (call.createdAt || '').slice(0, 10) || todayStr(),
    line_items: [],
    notes: '',
  }
  if (resolution?.outcome === 'done' && (resolution.work_description || resolution.amount_cents != null)) {
    draft.line_items.push({
      description: resolution.work_description || outputs.serviceType || 'Service',
      amount: resolution.amount_cents != null ? resolution.amount_cents / 100 : '',
    })
  }
  const noteParts = []
  if (outputs.problem) noteParts.push(outputs.problem)
  if (resolution?.notes) noteParts.push(resolution.notes)
  draft.notes = noteParts.join(' — ')
  return draft
}

// Builds the natural-language context string passed to the AI parse-invoice
// edge function so it can flesh out a polished line item description.
export function buildAIContextFromCall(call, outputs, resolution) {
  const lines = []
  if (outputs.customerName) lines.push(`Customer: ${outputs.customerName}`)
  const phone = outputs.customerPhone || call.customer?.number
  if (phone) lines.push(`Phone: ${phone}`)
  if (outputs.customerAddress) lines.push(`Address: ${outputs.customerAddress}`)
  const date = (call.createdAt || '').slice(0, 10)
  if (date) lines.push(`Service date: ${date}`)
  if (outputs.serviceType) lines.push(`Service type: ${outputs.serviceType}`)
  if (outputs.problem) lines.push(`Reported problem: ${outputs.problem}`)
  const summary = outputs.callSummary || call.analysis?.summary
  if (summary) lines.push(`Call summary: ${summary}`)
  if (resolution?.work_description) lines.push(`Work performed: ${resolution.work_description}`)
  if (resolution?.amount_cents != null) lines.push(`Amount charged: $${(resolution.amount_cents / 100).toFixed(2)}`)
  if (resolution?.notes) lines.push(`Internal notes: ${resolution.notes}`)
  return lines.join('\n')
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
export function emailTemplateVars(invoice, profile, { pdfUrl } = {}) {
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
    invoice_pdf_url:      pdfUrl || '',
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
  'invoice_number', 'invoice_pdf_url', 'serviced_unit', 'service_date',
  'subtotal', 'tax_amount', 'total', 'notes',
  'shop_name', 'business_email', 'business_website', 'business_phone', 'business_address',
]

export function applyTemplate(template, vars) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m
  )
}

// Picks the right URL scheme so the customer's "Email customer" tap lands in
// their email composer of choice:
//   - iOS:     googlegmail:// (opens Gmail app if installed)
//   - Android: mailto:        (Gmail handles it as the default)
//   - Desktop: Gmail web compose
function platform() {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export function buildEmailComposeUrl({ to, subject, body }) {
  const t = to || ''
  const su = subject || ''
  const b = body || ''
  switch (platform()) {
    case 'ios':
      return `googlegmail://co?to=${encodeURIComponent(t)}`
        + `&subject=${encodeURIComponent(su)}`
        + `&body=${encodeURIComponent(b)}`
    case 'android':
      return `mailto:${encodeURIComponent(t)}`
        + `?subject=${encodeURIComponent(su)}`
        + `&body=${encodeURIComponent(b)}`
    default: {
      const params = new URLSearchParams({ view: 'cm', fs: '1', to: t, su, body: b })
      return `https://mail.google.com/mail/?${params.toString()}`
    }
  }
}

// If the user's body template doesn't reference {{invoice_pdf_url}} explicitly,
// append a one-liner so the link is never silently dropped.
function ensurePdfLinkInBody(body, pdfUrl) {
  if (!pdfUrl) return body
  if (/\{\{\s*invoice_pdf_url\s*\}\}/.test(body)) return body
  if (body.includes(pdfUrl)) return body
  const sep = body.endsWith('\n') ? '\n' : '\n\n'
  return `${body}${sep}View your invoice: ${pdfUrl}`
}

export function buildGmailCompose(invoice, profile, { subject, body, pdfUrl } = {}) {
  const vars = emailTemplateVars(invoice, profile, { pdfUrl })
  const filledSubject = applyTemplate(subject || '', vars)
  const filledBody = ensurePdfLinkInBody(applyTemplate(body || '', vars), pdfUrl)
  return buildEmailComposeUrl({
    to: invoice.customer_email,
    subject: filledSubject,
    body: filledBody,
  })
}

// Uploads a generated invoice PDF to the per-user Storage folder and returns
// a 30-day signed URL safe to drop into an email body.
//
// Path layout: <user_id>/<invoice_number>-<unix_ms>.pdf
// (timestamp suffix lets the same invoice be re-emailed without overwrite races)
export async function uploadInvoicePdf(invoice, blob) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const path = `${s.user.id}/${invoice.invoice_number}-${Date.now()}.pdf`
  const { error: uploadErr } = await supabase
    .storage
    .from('invoice-pdfs')
    .upload(path, blob, { contentType: 'application/pdf', upsert: false })
  if (uploadErr) throw new Error(uploadErr.message)

  const { data, error: urlErr } = await supabase
    .storage
    .from('invoice-pdfs')
    .createSignedUrl(path, 60 * 60 * 24 * 30) // 30 days
  if (urlErr) throw new Error(urlErr.message)
  return data.signedUrl
}

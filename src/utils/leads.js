import { supabase } from '../lib/supabase'
import { getSession } from './auth'

export const LEAD_STATUSES = {
  waiting:       { label: 'Waiting',          short: 'Waiting', tone: 'yellow' },
  booked:        { label: 'Booked',           short: 'Booked',  tone: 'green' },
  done:          { label: 'Done',             short: 'Done',    tone: 'blue' },
  didnt_work_out:{ label: "Didn't work out",  short: 'Lost',    tone: 'red' },
}

export async function fetchLeads() {
  const s = await getSession()
  if (!s) return []
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', s.user.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function createLead(fields) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('leads')
    .insert({
      user_id: s.user.id,
      name:    fields.name    || null,
      email:   fields.email   || null,
      phone:   fields.phone   || null,
      details: fields.details || null,
      source:  fields.source  || 'manual',
      status:  'waiting',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateLead(id, updates) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', s.user.id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteLead(id) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('user_id', s.user.id)
  if (error) throw new Error(error.message)
}

// Resolves a lead with the given outcome. For "booked", optionally creates
// (or replaces) the linked appointments row when both date and time_start
// are concrete. Without a date+time, the lead just shifts to status='booked'
// — Mike can edit later to slot it in.
export async function resolveLead(lead, outcome, fields = {}) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')

  const updates = {
    status: outcome,
    booked_for: outcome === 'booked' ? (fields.booked_for || null) : null,
    amount_cents: outcome === 'done' ? (fields.amount_cents ?? null) : null,
    work_description: outcome === 'done' ? (fields.work_description || null) : null,
    notes: fields.notes || null,
  }

  // If we already have an appointment linked and we're rebooking with new
  // concrete date/time, update in place. If the outcome is no longer "booked"
  // OR the new booking is flexible (no date/time), cancel the old appointment.
  let appointmentId = lead.appointment_id || null
  const wantsAppointment = outcome === 'booked' && fields.date && fields.time_start

  if (appointmentId) {
    if (wantsAppointment) {
      const { error } = await supabase
        .from('appointments')
        .update({
          date: fields.date,
          time_start: `${fields.time_start}:00`,
          time_end: addTwoHours(fields.time_start),
          service_type: fields.service_type || null,
          customer_address: fields.customer_address || null,
          problem: fields.problem || null,
          notes: fields.notes || null,
          status: 'scheduled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
        .eq('user_id', s.user.id)
      if (error) throw new Error(error.message)
    } else {
      // Outcome changed away from a concrete booking → cancel the slot.
      await supabase
        .from('appointments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .eq('user_id', s.user.id)
      appointmentId = null
    }
  } else if (wantsAppointment) {
    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        user_id: s.user.id,
        customer_name: lead.name || null,
        customer_phone: lead.phone || null,
        customer_address: fields.customer_address || null,
        service_type: fields.service_type || null,
        problem: fields.problem || null,
        date: fields.date,
        time_start: `${fields.time_start}:00`,
        time_end: addTwoHours(fields.time_start),
        status: 'scheduled',
        notes: fields.notes || null,
        source: 'lead',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    appointmentId = appt.id
  }

  updates.appointment_id = appointmentId
  return updateLead(lead.id, updates)
}

function addTwoHours(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + 120
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:00`
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// AI assist for the Booked-outcome form: free-form notes → structured booking.
export async function aiParseLeadBooking(text) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-lead-booking`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data?.error || `AI parse failed (${res.status})`)
  return data.booking
}

export function leadIntakeUrl() {
  return `${SUPABASE_URL}/functions/v1/intake-lead`
}

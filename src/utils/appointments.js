import { supabase } from '../lib/supabase'
import { extractAppointment } from './formatters'

export async function fetchAppointments(startDate, endDate) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', session.user.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .neq('status', 'cancelled')
    .order('date')
    .order('time_start')
  if (error) throw new Error(error.message)
  return data || []
}

export async function createAppointment(appt) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appt, user_id: session.user.id })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateAppointment(id, updates) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('appointments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function cancelAppointment(id) {
  return updateAppointment(id, { status: 'cancelled' })
}

export async function rescheduleAppointment(id, date, timeStart, timeEnd) {
  return updateAppointment(id, { date, time_start: timeStart, time_end: timeEnd, status: 'scheduled' })
}

export async function upsertAppointmentsFromCalls(calls) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { inserted: 0, skipped: 0 }

  const rows = []
  for (const call of calls || []) {
    const appt = extractAppointment(call)
    if (appt) rows.push({ ...appt, user_id: session.user.id })
  }
  if (rows.length === 0) return { inserted: 0, skipped: 0 }

  const { data, error } = await supabase
    .from('appointments')
    .upsert(rows, { onConflict: 'call_id', ignoreDuplicates: true })
    .select('id')

  if (error) {
    console.warn('[appointments] backfill failed:', error.message)
    return { inserted: 0, skipped: rows.length, error: error.message }
  }
  return { inserted: data?.length || 0, skipped: 0 }
}

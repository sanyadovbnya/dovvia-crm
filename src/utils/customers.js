import { supabase } from '../lib/supabase'
import { phoneDigits } from './phone'

export { phoneDigits, fmtPhone } from './phone'

export async function fetchAllAppointments() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const { data, error } = await supabase
    .from('appointments')
    .select('id, customer_name, customer_phone, caller_phone, customer_address, service_type, problem, date, time_start, time_end, status, notes, created_at')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false })
    .order('time_start', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// Group appointments by phone digits into customer records.
// Prefers caller_phone (actual inbound number) over customer_phone (spoken),
// falling back to name when neither is present.
export function groupIntoCustomers(appointments) {
  const today = new Date().toISOString().slice(0, 10)
  const byKey = new Map()

  for (const a of appointments) {
    const callerKey = phoneDigits(a.caller_phone)
    const spokenKey = phoneDigits(a.customer_phone)
    const key = callerKey || spokenKey || `name:${(a.customer_name || 'unknown').toLowerCase().trim()}`
    const existing = byKey.get(key)

    if (!existing) {
      byKey.set(key, {
        key,
        name: a.customer_name || 'Unknown',
        phone: a.customer_phone || null,
        callerPhone: a.caller_phone || null,
        address: a.customer_address || null,
        appointments: [a],
        total: 1,
        scheduled: a.status === 'scheduled' ? 1 : 0,
        completed: a.status === 'completed' ? 1 : 0,
        cancelled: a.status === 'cancelled' ? 1 : 0,
        upcoming: (a.date >= today && a.status !== 'cancelled') ? 1 : 0,
        services: a.service_type ? { [a.service_type]: 1 } : {},
        firstDate: a.date,
        lastDate: a.date,
      })
      continue
    }

    existing.appointments.push(a)
    existing.total += 1
    if (a.status === 'scheduled') existing.scheduled += 1
    if (a.status === 'completed') existing.completed += 1
    if (a.status === 'cancelled') existing.cancelled += 1
    if (a.date >= today && a.status !== 'cancelled') existing.upcoming += 1
    if (a.service_type) existing.services[a.service_type] = (existing.services[a.service_type] || 0) + 1
    if (a.date < existing.firstDate) existing.firstDate = a.date
    if (a.date > existing.lastDate) existing.lastDate = a.date
    if (!existing.address && a.customer_address) existing.address = a.customer_address
    if (!existing.phone && a.customer_phone) existing.phone = a.customer_phone
    if (!existing.callerPhone && a.caller_phone) existing.callerPhone = a.caller_phone
    if ((a.customer_name?.length || 0) > (existing.name?.length || 0)) existing.name = a.customer_name
  }

  return [...byKey.values()].sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''))
}

export function topServices(customer, n = 3) {
  return Object.entries(customer.services || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([s]) => s)
}

export async function deleteCustomerAppointments(ids) {
  if (!ids || ids.length === 0) return { deleted: 0 }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const { error, count } = await supabase
    .from('appointments')
    .delete({ count: 'exact' })
    .in('id', ids)
    .eq('user_id', session.user.id)
  if (error) throw new Error(error.message)
  return { deleted: count || 0 }
}

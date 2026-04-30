import { supabase } from '../lib/supabase'
import { getSession } from './auth'

export const OUTCOMES = {
  didnt_work_out: { label: "Didn't work out", short: 'Lost',   tone: 'red' },
  booked:         { label: 'Booked',          short: 'Booked', tone: 'green' },
  done:           { label: 'Done',            short: 'Done',   tone: 'blue' },
}

export async function fetchResolutions() {
  const s = await getSession()
  if (!s) return []
  const { data, error } = await supabase
    .from('call_resolutions')
    .select('*')
    .eq('user_id', s.user.id)
  if (error) throw new Error(error.message)
  return data || []
}

export function indexResolutions(rows) {
  const map = {}
  for (const r of rows || []) map[r.call_id] = r
  return map
}

export async function upsertResolution({ call_id, outcome, booked_for, amount_cents, work_description, notes }) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const payload = {
    user_id: s.user.id,
    call_id,
    outcome,
    booked_for: outcome === 'booked' ? (booked_for || null) : null,
    amount_cents: outcome === 'done' ? (amount_cents ?? null) : null,
    work_description: outcome === 'done' ? (work_description || null) : null,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('call_resolutions')
    .upsert(payload, { onConflict: 'user_id,call_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteResolution(call_id) {
  const s = await getSession()
  if (!s) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('call_resolutions')
    .delete()
    .eq('user_id', s.user.id)
    .eq('call_id', call_id)
  if (error) throw new Error(error.message)
}

export function parseAmountToCents(input) {
  if (input === null || input === undefined || input === '') return null
  const n = Number(String(input).replace(/[^\d.\-]/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function fmtCents(cents) {
  if (cents === null || cents === undefined) return null
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

import { supabase } from '../lib/supabase'
import { getSession } from './auth'
import { groupIntoCustomers, fetchAllAppointments } from './customers'

// Loads every appointment that has been geocoded, then folds them into
// customers (one pin per customer at their most recent geocoded
// address). Browser-side; the calls function returns nothing if a
// tenant has no geocoded addresses yet — caller can then trigger a
// backfill via runGeocodeBatch().
export async function fetchMapCustomers() {
  const all = await fetchAllAppointments()
  const customers = groupIntoCustomers(all)
  // Each customer derives from many appointments. Pick the most recent
  // geocoded one for the pin position; collect all the customer's
  // appointments for the click-popup detail.
  return customers
    .map(c => {
      const geocoded = (c.appointments || [])
        .filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lng))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const pin = geocoded[0]
      if (!pin) return null
      return {
        ...c,
        lat: pin.lat,
        lng: pin.lng,
        pinAddress: pin.customer_address || c.address,
      }
    })
    .filter(Boolean)
}

// Returns a count of addresses that still need geocoding for the
// current user. Used to decide whether to show the "Geocode" prompt
// on the Map page.
export async function countPendingGeocodes() {
  const s = await getSession()
  if (!s?.user?.id) return 0
  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', s.user.id)
    .is('lat', null)
    .is('geocode_status', null)
    .not('customer_address', 'is', null)
  if (error) return 0
  return count || 0
}

// Triggers one batch of the geocode-pending edge function. Returns
// { processed, geocoded, remaining }. The caller is expected to loop
// until remaining === 0 (or stop when the user navigates away).
export async function runGeocodeBatch() {
  const s = await getSession()
  if (!s) throw new Error('not authenticated')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geocode-pending`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.ok) throw new Error(data?.error || `geocode failed (${r.status})`)
  return data
}

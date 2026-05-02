import { supabase } from '../lib/supabase'
import { getSession } from './auth'

// Reads from the public.calls mirror that the vapi-webhook edge function
// keeps in sync. The browser no longer talks to Vapi directly; the API
// key lives on the server, and call history is durable across sessions
// and devices.

// Reshapes a row from the calls table back into the Vapi-shaped object the
// rest of the codebase expects (callOutputs, isBooked, fmtDate, etc).
// Doing this in one place means the rest of the app didn't need to learn
// about the new schema.
export function rowToCall(row) {
  if (!row) return null
  // Reconstruct the structuredData shape callOutputs expects.
  const structuredData = {}
  if (row.customer_name)     structuredData.customerName    = row.customer_name
  if (row.customer_phone)    structuredData.customerPhone   = row.customer_phone
  if (row.customer_address)  structuredData.customerAddress = row.customer_address
  if (row.service_type)      structuredData.serviceType     = row.service_type
  if (row.problem)           structuredData.problem         = row.problem
  if (row.appointment_date)  structuredData.appointmentDate = row.appointment_date
  if (row.appointment_time)  structuredData.appointmentTime = row.appointment_time
  if (row.appointment_booked != null) structuredData.appointmentBooked = row.appointment_booked
  if (row.wants_callback != null)     structuredData.wantsCallback     = row.wants_callback
  if (row.summary)           structuredData.callSummary     = row.summary

  // Prefer the raw payload Vapi sent us (it has everything) and overlay
  // our extracted fields. That way callOutputs (which reads several
  // alternative paths) keeps working AND any field we forgot to mirror
  // is still accessible.
  const raw = row.vapi_raw || {}
  return {
    ...raw,
    id: raw.id || row.vapi_id,
    createdAt: raw.createdAt || row.vapi_created_at || row.started_at,
    startedAt: raw.startedAt || row.started_at,
    endedAt:   raw.endedAt   || row.ended_at,
    endedReason: raw.endedReason || row.end_reason,
    customer:  raw.customer || (row.customer_phone ? { number: row.customer_phone } : null),
    artifact:  raw.artifact || {
      transcript:   row.transcript,
      recordingUrl: row.recording_url,
    },
    analysis: raw.analysis || row.analysis || (row.summary ? { summary: row.summary } : undefined),
    // Force structuredData to merge our columns over whatever raw had —
    // our columns are normalized while raw might be the original mess.
    ...(Object.keys(structuredData).length ? {
      analysis: {
        ...(raw.analysis || {}),
        structuredData: { ...(raw.analysis?.structuredData || {}), ...structuredData },
      },
    } : {}),
  }
}

// Fetches the most-recent N calls for the current user. The dashboard
// renders 50 at a time and paginates locally.
//
// We sort by updated_at (always populated by every upsert) instead of
// started_at because Vapi sometimes delivers a partial event before the
// end-of-call-report — those rows have null started_at and would get
// nulls-last sorted off the visible page. updated_at represents "when
// did we last hear about this call" which is the right recency signal
// for the dashboard either way.
export async function fetchCallsFromDb({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data || []).map(rowToCall).filter(Boolean)
}

// Subscribes to inserts + updates on this user's calls. The callback
// receives the reshaped Vapi-style call object; the parent can merge it
// into its existing list. Returns an unsubscribe function.
export async function subscribeToCalls(onChange) {
  const s = await getSession()
  if (!s?.user?.id) return () => {}
  const channel = supabase
    .channel(`calls:user=${s.user.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calls', filter: `user_id=eq.${s.user.id}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onChange({ type: 'delete', id: payload.old?.vapi_id })
          return
        }
        const call = rowToCall(payload.new)
        if (call) onChange({ type: 'upsert', call })
      },
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// Triggers the vapi-sync edge function for the current user. Used from
// Settings → "Sync from Vapi" (also a one-click backfill on first setup).
export async function syncFromVapi() {
  const s = await getSession()
  if (!s) throw new Error('not authenticated')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vapi-sync`
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
  if (!r.ok || !data.ok) throw new Error(data?.error || `sync failed (${r.status})`)
  return data  // { ok, inserted, pages }
}

// Convenience: builds the URL the tenant pastes into Vapi's "Server URL"
// setting. The matching secret lives in profiles.vapi_webhook_secret.
export function vapiWebhookUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vapi-webhook`
}

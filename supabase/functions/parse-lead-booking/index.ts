// AI-assist for booking a web lead: takes free-form notes (English or Russian)
// from the operator and returns structured appointment fields. The CRM uses
// this to pre-fill the Booked-outcome form so Mike can paste a quick recap
// from his callback and click Save.
//
// Deploy: supabase functions deploy parse-lead-booking --no-verify-jwt
// Secret:  OPENAI_API_KEY (set via `supabase secrets set OPENAI_API_KEY=...`)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const SYSTEM_PROMPT = `You are an assistant that converts a repair-shop owner's free-form notes about a customer call back into a structured appointment booking.

The notes may be in English or Russian (or mixed). ALWAYS produce English output. Translate addresses and descriptions into clean professional English.

Return ONLY a JSON object with these fields. Use null or omit fields that aren't mentioned in the notes — do not invent data.

{
  "date":            "string|null",   // YYYY-MM-DD if a concrete date is mentioned, otherwise null
  "time_start":      "string|null",   // HH:MM (24-hour) if a concrete time is mentioned, otherwise null
  "booked_for_text": "string|null",   // human-readable when ("next Tuesday afternoon", "TBD", etc.) — only use when date/time are not concrete
  "service_type":    "string|null",   // English category, e.g. "Appliance Repair", "HVAC", "Plumbing", "Pellet Stove"
  "problem":         "string|null",   // 1–2 sentence English description of the issue
  "customer_address":"string|null",   // English mailing address if mentioned
  "notes":           "string|null"    // any extra context worth keeping for Mike
}

Rules:
- If the user writes "Tuesday at 2pm" without a date, leave date and time_start null and put "Tuesday at 2pm" in booked_for_text.
- If a concrete date AND time both appear, fill date + time_start and leave booked_for_text null.
- Time format examples: "2pm" → "14:00", "10:30 am" → "10:30", "noon" → "12:00".
- Date format examples: "April 24" with current year inferred → "YYYY-04-24". "04/24/2026" → "2026-04-24". "tomorrow" → resolve relative to the supplied today.
- service_type: use the closest of "Appliance Repair", "HVAC", "Plumbing", "Pellet Stove", "Electrical", "General Home Services" unless the notes clearly call for something else.
- Output JSON ONLY. No prose, no markdown fences.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'invalid json' }, 400) }

  const text = (body?.text || '').toString().trim()
  if (!text) return json({ ok: false, error: 'missing text' }, 400)
  if (text.length > 4000) return json({ ok: false, error: 'text too long' }, 400)

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return json({ ok: false, error: 'OPENAI_API_KEY not configured' }, 500)

  const today = new Date().toISOString().slice(0, 10)
  const userMsg = `Today's date is ${today}.\n\nNotes:\n${text}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMsg },
      ],
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('openai error:', res.status, detail)
    return json({ ok: false, error: `OpenAI ${res.status}` }, 502)
  }

  const payload = await res.json()
  const content = payload?.choices?.[0]?.message?.content
  if (!content) return json({ ok: false, error: 'empty response' }, 502)

  let parsed: any
  try { parsed = JSON.parse(content) } catch {
    return json({ ok: false, error: 'invalid model output' }, 502)
  }

  const safe = {
    date:             /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : '',
    time_start:       /^\d{1,2}:\d{2}$/.test(parsed.time_start) ? parsed.time_start : '',
    booked_for_text:  parsed.booked_for_text ? String(parsed.booked_for_text) : '',
    service_type:     parsed.service_type ? String(parsed.service_type) : '',
    problem:          parsed.problem ? String(parsed.problem) : '',
    customer_address: parsed.customer_address ? String(parsed.customer_address) : '',
    notes:            parsed.notes ? String(parsed.notes) : '',
  }

  return json({ ok: true, booking: safe })
})

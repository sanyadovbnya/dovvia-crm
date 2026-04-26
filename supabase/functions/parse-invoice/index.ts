// AI-assist for invoice creation: takes free-form notes (English or Russian)
// and returns a structured invoice JSON. The CRM pre-fills the New Invoice
// form with the result.
//
// Deploy: supabase functions deploy parse-invoice --no-verify-jwt
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

const SYSTEM_PROMPT = `You are an assistant that converts plain-language repair shop notes into a structured invoice JSON.

The notes may be in English or Russian (or mixed). ALWAYS produce English output. Translate names, addresses, and descriptions into clean professional English. Transliterate names (e.g. "Кристофер Майерс" → "Chris Myers", "Иван Петров" → "Ivan Petrov").

Return ONLY a JSON object with these fields. Use null or omit fields that aren't mentioned in the notes — do not invent data.

{
  "customer_name": "string",         // English; required if any name was mentioned
  "customer_email": "string|null",
  "customer_phone": "string|null",   // E.164 if you can infer country, otherwise as written
  "customer_address": "string|null", // English
  "serviced_unit": "string|null",    // English, e.g. "Pellet Stove", "Refrigerator", "Dishwasher"
  "service_date": "string|null",     // YYYY-MM-DD
  "line_items": [{ "description": "string (English)", "amount": number }],
  "tax_rate": number|null,           // percent, e.g. 9 for 9%
  "notes": "string|null"             // any extra context worth keeping, English
}

Rules:
- Money values are USD numbers (e.g. 400, not "$400"). Strip currency symbols.
- If the user writes "стоимость работы 380" or "labor 380", treat it as a line item with description "Labor" and amount 380.
- Common parts (плата управления → "Control Board", двигатель → "Motor", термостат → "Thermostat", etc.).
- Service date: parse common formats (04/24/2026, 24.04.2026, "April 24"). If only month+day are given, assume the current year. If no date at all, leave null.
- Tax rate: if the user writes "налог 9%" or "9% tax", set tax_rate to 9.
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
        { role: 'user', content: userMsg },
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

  // Sanitize: only keep keys we expect, coerce numerics
  const safe = {
    customer_name:    parsed.customer_name ? String(parsed.customer_name) : '',
    customer_email:   parsed.customer_email ? String(parsed.customer_email) : '',
    customer_phone:   parsed.customer_phone ? String(parsed.customer_phone) : '',
    customer_address: parsed.customer_address ? String(parsed.customer_address) : '',
    serviced_unit:    parsed.serviced_unit ? String(parsed.serviced_unit) : '',
    service_date:     /^\d{4}-\d{2}-\d{2}$/.test(parsed.service_date) ? parsed.service_date : '',
    line_items: Array.isArray(parsed.line_items)
      ? parsed.line_items
          .filter((l: any) => l && (l.description || l.amount != null))
          .map((l: any) => ({
            description: String(l.description || ''),
            amount: Number(l.amount) || 0,
          }))
      : [],
    tax_rate: parsed.tax_rate != null && Number.isFinite(Number(parsed.tax_rate)) ? Number(parsed.tax_rate) : null,
    notes:    parsed.notes ? String(parsed.notes) : '',
  }

  return json({ ok: true, invoice: safe })
})

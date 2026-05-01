// AI-translate any short snippet (call summary, transcript, lead notes) to
// the target language. Mike's team has Russian-speaking dispatch, so call
// summaries that Max captures in English need to flip to Russian on demand.
//
// Deploy: supabase functions deploy translate --no-verify-jwt
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

// Hard cap so a runaway transcript paste doesn't run up the OpenAI bill.
// 6k chars ≈ 1500 tokens at gpt-4o-mini rates ≈ $0.0002 / call. Plenty for
// a multi-paragraph call summary.
const MAX_INPUT_CHARS = 6000

const LANG_NAME: Record<string, string> = {
  ru: 'Russian',
  en: 'English',
  es: 'Spanish',
  uk: 'Ukrainian',
}

function systemPrompt(targetName: string) {
  return `You are a precise translator for a US home-services CRM. Translate the user's text to ${targetName}, preserving meaning, names, addresses, phone numbers, dates, and tone. Do not add commentary, quotes, or explanations — output the translation only. If the input is already in ${targetName}, return it unchanged.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')   return json({ ok: false, error: 'POST only' }, 405)

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return json({ ok: false, error: 'OPENAI_API_KEY not configured' }, 500)

  let payload: { text?: string; target?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400)
  }

  const text = (payload.text || '').trim()
  const target = (payload.target || 'ru').toLowerCase()
  if (!text) return json({ ok: false, error: 'text is required' }, 400)
  if (text.length > MAX_INPUT_CHARS) {
    return json({ ok: false, error: `text exceeds ${MAX_INPUT_CHARS} chars` }, 413)
  }
  const targetName = LANG_NAME[target] || 'Russian'

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt(targetName) },
          { role: 'user',   content: text },
        ],
      }),
    })
    const data = await r.json()
    if (!r.ok) {
      return json({ ok: false, error: data.error?.message || `openai ${r.status}` }, 502)
    }
    const translated = (data.choices?.[0]?.message?.content || '').trim()
    if (!translated) return json({ ok: false, error: 'empty translation' }, 502)
    return json({ ok: true, translated, target })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || 'translate failed' }, 500)
  }
})

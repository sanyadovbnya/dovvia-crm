import { callEdgeFunction } from './edgeFunctions'

// Asks the `translate` edge function (gpt-4o-mini) to render `text` in the
// target language. Defaults to Russian since that's the only target Mike's
// team uses today; the edge function accepts es/uk/en as well.
export async function translateText(text, target = 'ru') {
  if (!text || !text.trim()) return ''
  const data = await callEdgeFunction('translate', { text, target })
  return data.translated || ''
}

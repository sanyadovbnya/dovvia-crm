import { supabase } from '../lib/supabase'
import { getSession } from './auth'

export async function fetchReviews() {
  const s = await getSession()
  if (!s) return []
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('user_id', s.user.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export function reviewStats(reviews) {
  const submitted = (reviews || []).filter(r => r.rating !== null && r.rating !== undefined)
  const total = submitted.length
  const sum = submitted.reduce((s, r) => s + (Number(r.rating) || 0), 0)
  const avg = total ? sum / total : 0
  const breakdown = [5, 4, 3, 2, 1].map(stars => ({
    stars,
    count: submitted.filter(r => r.rating === stars).length,
  }))
  const sentTotal = (reviews || []).filter(r => r.request_sent_at).length
  const responseRate = sentTotal ? Math.round((total / sentTotal) * 100) : 0
  return { total, avg, breakdown, sentTotal, responseRate }
}

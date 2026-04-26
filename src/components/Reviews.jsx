import { useEffect, useMemo, useState } from 'react'
import { fetchReviews, reviewStats } from '../utils/reviews'
import { Icons } from './Icons'

function StarRow({ rating, size = 14 }) {
  return (
    <span className="inline-flex gap-0.5 text-brand-500">
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24"
          fill={n <= rating ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={n > rating ? 'text-slate-300 dark:text-slate-600' : ''}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

function fmtWhen(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function Reviews() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchReviews()
      .then(r => { if (active) setReviews(r) })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const stats = useMemo(() => reviewStats(reviews), [reviews])
  const submitted = useMemo(() => reviews.filter(r => r.rating != null), [reviews])
  const pending   = useMemo(() => reviews.filter(r => r.rating == null), [reviews])

  if (loading) {
    return (
      <div className="card p-16 text-center text-ink-muted dark:text-slate-400">
        <span className="spinner inline-block mb-3"><Icons.Spinner /></span>
        <p>Loading reviews…</p>
      </div>
    )
  }

  if (!reviews.length) {
    return (
      <div className="card p-16 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center text-brand-600 dark:text-brand-300">
          <Icons.Star filled />
        </div>
        <p className="text-ink-strong dark:text-slate-100 font-medium">No reviews yet.</p>
        <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">Customers get a review request 24h after their appointment ends. Make sure SMS is configured in Settings.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Summary */}
      <div className="card p-5 lg:col-span-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">Average</p>
        <div className="mt-3 flex items-baseline gap-3">
          <p className="text-5xl font-bold text-ink-strong dark:text-slate-100 leading-none">
            {stats.total ? stats.avg.toFixed(1) : '—'}
          </p>
          <StarRow rating={Math.round(stats.avg)} size={20} />
        </div>
        <p className="mt-2 text-sm text-ink-muted dark:text-slate-400">
          {stats.total} review{stats.total === 1 ? '' : 's'} submitted
        </p>

        <div className="mt-5 space-y-1.5">
          {stats.breakdown.map(b => {
            const pct = stats.total ? (b.count / stats.total) * 100 : 0
            return (
              <div key={b.stars} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-ink-muted dark:text-slate-400 tabular-nums">{b.stars}</span>
                <Icons.Star filled />
                <div className="flex-1 h-2 rounded-full bg-surface-muted dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-6 text-right text-ink-muted dark:text-slate-400 tabular-nums">{b.count}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-ink-muted dark:text-slate-400">Requests sent</p>
            <p className="font-semibold text-ink-strong dark:text-slate-100">{stats.sentTotal}</p>
          </div>
          <div>
            <p className="text-ink-muted dark:text-slate-400">Response rate</p>
            <p className="font-semibold text-ink-strong dark:text-slate-100">{stats.responseRate}%</p>
          </div>
        </div>
      </div>

      {/* Recent submitted reviews */}
      <div className="card p-5 lg:col-span-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-3">Recent</p>
        {submitted.length === 0 ? (
          <p className="text-sm text-ink-faint dark:text-slate-500 py-6 text-center">No submitted reviews yet — only pending ones.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {submitted.map(r => (
              <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-ink-strong dark:text-slate-100 truncate">{r.customer_name || 'Anonymous'}</span>
                    <StarRow rating={r.rating} />
                    {r.redirected_to_google && (
                      <span className="badge badge-green">Google</span>
                    )}
                  </div>
                  <span className="text-xs text-ink-muted dark:text-slate-400 shrink-0">{fmtWhen(r.submitted_at)}</span>
                </div>
                {r.feedback && (
                  <p className="text-sm text-ink-base dark:text-slate-300 mt-1.5">{r.feedback}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="card p-5 lg:col-span-12">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-2">Pending ({pending.length})</p>
          <p className="text-sm text-ink-muted dark:text-slate-400">{pending.length} customer{pending.length === 1 ? '' : 's'} got a request but haven&apos;t responded yet.</p>
        </div>
      )}

      {error && (
        <div className="lg:col-span-12 rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

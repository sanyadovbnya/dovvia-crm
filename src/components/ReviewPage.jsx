import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Icons } from './Icons'
import { useTheme } from '../utils/theme'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="absolute top-4 right-4 z-10 h-10 w-10 rounded-xl bg-white/80 hover:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-ink-base dark:text-slate-300 flex items-center justify-center shadow-card backdrop-blur transition"
    >
      {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
    </button>
  )
}

function StarPicker({ value, onChange, size = 36 }) {
  const [hover, setHover] = useState(0)
  const display = hover || value
  return (
    <div className="flex items-center justify-center gap-2" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`transition-transform hover:scale-110 ${n <= display ? 'text-brand-500' : 'text-slate-300 dark:text-slate-600'}`}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" fill={n <= display ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      ))}
    </div>
  )
}

export default function ReviewPage() {
  const { token } = useParams()

  const [info, setInfo] = useState(null) // { customer_name, shop_name, google_review_url, alreadySubmitted, rating }
  const [loadErr, setLoadErr] = useState('')
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null) // { rating, redirect_url }

  useEffect(() => {
    if (!token) return
    fetch(`${SUPABASE_URL}/functions/v1/review?token=${encodeURIComponent(token)}`, {
      headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY },
    })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) { setLoadErr(data.error || 'Could not load review.'); return }
        setInfo({
          customer_name: data.review?.customer_name,
          shop_name: data.shop_name,
          google_review_url: data.google_review_url,
          alreadySubmitted: Boolean(data.review?.submitted_at),
          existingRating: data.review?.rating,
        })
      })
      .catch(e => setLoadErr(e.message))
  }, [token])

  async function handleSubmit() {
    if (!rating) { setLoadErr('Pick a rating first.'); return }
    setSubmitting(true); setLoadErr('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, rating, feedback }),
      })
      const data = await res.json()
      if (!data.ok) { setLoadErr(data.error || 'Submit failed.'); return }
      setSubmitted({ rating, redirect_url: data.redirect_url })
      if (data.redirect_url) {
        // Small delay so the user sees the thank-you screen for a beat
        setTimeout(() => { window.location.href = data.redirect_url }, 1200)
      }
    } catch (e) {
      setLoadErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface-page dark:bg-slate-950 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-brand-200/50 dark:bg-brand-500/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-pastel-lavender/60 dark:bg-indigo-500/10 blur-3xl" />
      <ThemeToggle />

      <div className="fade-in relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-float">
            <Icons.Star filled />
          </div>
          <h1 className="text-2xl font-bold text-ink-strong dark:text-slate-100">
            {info?.shop_name ? `How was your ${info.shop_name} experience?` : 'How did we do?'}
          </h1>
          {info?.customer_name && (
            <p className="mt-1.5 text-sm text-ink-muted dark:text-slate-400">Thanks {info.customer_name}, your feedback helps a lot.</p>
          )}
        </div>

        <div className="card p-7">
          {!info && !loadErr && (
            <div className="py-8 text-center text-ink-muted dark:text-slate-400">
              <span className="spinner inline-block mb-3"><Icons.Spinner /></span>
              <p>Loading…</p>
            </div>
          )}

          {loadErr && !info && (
            <p className="text-sm rounded-xl bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">
              {loadErr}
            </p>
          )}

          {info?.alreadySubmitted && (
            <div className="text-center py-6">
              <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 flex items-center justify-center">
                <Icons.Star filled />
              </div>
              <p className="text-ink-strong dark:text-slate-100 font-medium">You already left a review.</p>
              <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">
                You rated us {info.existingRating} out of 5. Thanks!
              </p>
            </div>
          )}

          {info && !info.alreadySubmitted && !submitted && (
            <>
              <p className="text-sm text-ink-muted dark:text-slate-400 mb-4 text-center">
                Tap the stars to rate.
              </p>
              <div className="mb-5"><StarPicker value={rating} onChange={setRating} /></div>

              {rating > 0 && rating <= 3 && (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-ink-strong dark:text-slate-200">
                    Sorry to hear that — what could we have done better?
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Tell us what happened so we can make it right…"
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                  />
                </div>
              )}

              {rating >= 4 && (
                <p className="text-sm text-ink-muted dark:text-slate-400 mb-3 text-center">
                  Glad to hear it!{info.google_review_url ? ' We\'ll send you to Google in a moment so others can find us.' : ''}
                </p>
              )}

              {loadErr && (
                <p className="text-sm rounded-xl bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2 mb-3">
                  {loadErr}
                </p>
              )}

              <button onClick={handleSubmit} disabled={submitting || !rating} className="btn-primary w-full h-12 text-base mt-2">
                {submitting ? 'Submitting…' : 'Submit review'}
              </button>
            </>
          )}

          {submitted && (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 flex items-center justify-center">
                <Icons.Star filled />
              </div>
              <p className="text-ink-strong dark:text-slate-100 font-semibold text-lg">Thank you!</p>
              {submitted.redirect_url ? (
                <p className="mt-2 text-sm text-ink-muted dark:text-slate-400">
                  Sending you to Google to share publicly…
                </p>
              ) : submitted.rating >= 4 ? (
                <p className="mt-2 text-sm text-ink-muted dark:text-slate-400">
                  We really appreciate it.
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink-muted dark:text-slate-400">
                  We&apos;ll review your feedback and follow up if needed.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint dark:text-slate-500">
          Powered by <Link to="/" className="font-semibold hover:text-ink-base dark:hover:text-slate-300">Dovvia</Link>
        </p>
      </div>
    </div>
  )
}

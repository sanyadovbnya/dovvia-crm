import { useState, useEffect } from 'react'
import { PLANS, startCheckout } from '../utils/billing'
import { Icons } from './Icons'

// Full-screen paywall shown to users whose subscription_status isn't
// active/trialing/past_due. Picking a plan opens Stripe Checkout in
// the same tab; once payment lands the webhook flips their status and
// the dashboard takes over.
//
// Past-due users see a slightly different UX: the "Update payment"
// notice up top + a button that sends them to the Customer Portal.
export default function SubscribeScreen({ status, onLogout, cancelled }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // Surface a generic error after a Checkout cancel so users know we
  // didn't lose their state — they just hit Stripe's back button.
  useEffect(() => {
    if (cancelled) setError('Checkout was cancelled — pick a plan when you\'re ready.')
  }, [cancelled])

  async function pickPlan(key) {
    setBusy(key); setError('')
    try {
      const url = await startCheckout(key)
      window.location.href = url
    } catch (e) {
      setError(e.message || 'Failed to start checkout')
      setBusy('')
    }
  }

  return (
    <div className="min-h-screen bg-surface-page dark:bg-slate-950 px-4 sm:px-6 lg:px-10 py-8 lg:py-16 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-card">
              <Icons.Wrench size={20} />
            </div>
            <div>
              <p className="font-bold text-ink-strong dark:text-slate-100 text-lg leading-tight">Dovvia CRM</p>
              <p className="text-xs text-ink-muted dark:text-slate-400">Pick a plan to get started</p>
            </div>
          </div>
          <button onClick={onLogout} className="btn-ghost text-rose-600 dark:text-rose-400 text-sm">
            <Icons.LogOut /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>

        {/* Past-due banner */}
        {status === 'past_due' && (
          <div className="mb-8 rounded-xl2 bg-pastel-peach dark:bg-orange-500/15 text-pastel-peachDeep dark:text-orange-300 px-5 py-4 text-sm">
            <p className="font-semibold mb-1">Your last payment didn't go through.</p>
            <p>Update your card to keep service running — Stripe will retry automatically.</p>
          </div>
        )}

        {/* Pricing intro */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-ink-strong dark:text-slate-100 mb-3">
            Stop missing calls.
          </h1>
          <p className="text-base sm:text-lg text-ink-muted dark:text-slate-400 max-w-2xl mx-auto">
            $500 one-time setup + your monthly plan. First 5 customers get <span className="font-semibold text-brand-600 dark:text-brand-400">25% off forever</span> with code <code className="font-mono">FOUNDER</code> at checkout.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm max-w-2xl mx-auto">
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map(plan => (
            <PlanCard
              key={plan.key}
              plan={plan}
              busy={busy === plan.key}
              disabled={!!busy}
              onPick={() => pickPlan(plan.key)}
            />
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-ink-muted dark:text-slate-500 mt-10 max-w-xl mx-auto leading-relaxed">
          Setup fee covers phone-number provisioning, AI configuration, and 30 days of dedicated onboarding support — non-refundable once activated.
          Subscriptions billed monthly; cancel anytime from the Customer Portal.
        </p>
      </div>
    </div>
  )
}

function PlanCard({ plan, busy, disabled, onPick }) {
  return (
    <div
      className={`relative rounded-xl2 p-6 flex flex-col ${plan.highlight
        ? 'bg-white dark:bg-slate-900 ring-2 ring-brand-500 shadow-pop'
        : 'bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-card'}`}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full px-3 py-1 shadow-card">
          ★ Most popular
        </span>
      )}
      <h3 className="text-xl font-bold text-ink-strong dark:text-slate-100">{plan.name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-bold text-ink-strong dark:text-slate-100 tabular-nums">${plan.price}</span>
        <span className="text-sm text-ink-muted dark:text-slate-400">{plan.sub}</span>
      </div>
      <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">+ $500 one-time setup</p>

      <ul className="mt-5 space-y-2 flex-1">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-2 text-sm text-ink-base dark:text-slate-300">
            <span className="text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0"><Icons.Check /></span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onPick}
        disabled={disabled}
        className={`mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition shadow-card disabled:opacity-60 disabled:cursor-not-allowed ${plan.highlight
          ? 'bg-brand-500 hover:bg-brand-600 text-white'
          : 'bg-surface-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-ink-strong dark:text-slate-100'}`}
      >
        {busy ? (<><span className="spinner inline-block"><Icons.Spinner /></span> Opening Stripe…</>)
              : (<>Subscribe <Icons.ChevronRight /></>)}
      </button>
    </div>
  )
}

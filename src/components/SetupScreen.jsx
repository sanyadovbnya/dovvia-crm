import { useState } from 'react'
import { testConnection } from '../api/vapi'
import { Icons } from './Icons'
import { useTheme } from '../utils/theme'

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

export default function SetupScreen({ onSave }) {
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [testing, setTesting] = useState(false)

  async function handleConnect() {
    if (!key.trim()) { setErr('Please enter your Vapi API key.'); return }
    setTesting(true); setErr('')
    try {
      await testConnection(key.trim())
      await onSave(key.trim())
    } catch (e) {
      setErr(e.message || 'Could not connect. Double-check your API key and try again.')
    } finally {
      setTesting(false)
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
            <Icons.Wrench size={24} />
          </div>
          <h1 className="text-2xl font-bold text-ink-strong dark:text-slate-100">Connect Dovvia</h1>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-slate-400">
            Paste your Vapi API key to pull in your calls
          </p>
        </div>

        <div className="card p-7 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-ink-strong dark:text-slate-200 mb-1.5">
              Vapi API Key
            </label>
            <input
              type="password"
              placeholder="vapi_xxxxxxxxxxxxxxxx…"
              value={key}
              onChange={e => setKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              autoFocus
            />
            <p className="mt-2 text-xs text-ink-muted dark:text-slate-400">
              Find it at{' '}
              <a
                href="https://dashboard.vapi.ai"
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold"
              >
                dashboard.vapi.ai
              </a>{' '}
              → Account → API Keys
            </p>
          </div>

          {err && (
            <p className="text-sm rounded-xl bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">
              {err}
            </p>
          )}

          <button
            onClick={handleConnect}
            disabled={testing}
            className="btn-primary w-full h-12 text-base"
          >
            {testing ? <><Icons.Spinner /> Connecting…</> : 'Connect to Vapi'}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint dark:text-slate-500">
          Your key is stored in your Dovvia profile only. It never leaves your Supabase.
        </p>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { Icons } from './Icons'
import { useTheme } from '../utils/theme'

function Logo() {
  return (
    <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-float">
      <Icons.Wrench size={24} />
    </div>
  )
}

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

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface-page dark:bg-slate-950 relative overflow-hidden">
      {/* ambient blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-brand-200/50 dark:bg-brand-500/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-pastel-lavender/60 dark:bg-indigo-500/10 blur-3xl" />

      <ThemeToggle />

      <div className="fade-in relative w-full max-w-md">
        <div className="text-center mb-6">
          <Logo />
          <h1 className="text-2xl font-bold text-ink-strong dark:text-slate-100">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-muted dark:text-slate-400">{subtitle}</p>}
        </div>

        <div className="card p-7">
          {children}
        </div>

        {footer && (
          <div className="text-center mt-6 text-sm text-ink-muted dark:text-slate-400">
            {footer}
          </div>
        )}

        <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-3 text-xs text-ink-faint dark:text-slate-500">
          <Link to="/" className="hover:text-ink-base dark:hover:text-slate-300">Terms</Link>
          <span>·</span>
          <Link to="/" className="hover:text-ink-base dark:hover:text-slate-300">Privacy</Link>
          <span>·</span>
          <span>© 2026 Dovvia</span>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../utils/auth'
import { AuthIcons } from './AuthIcons'
import AuthLayout from './AuthLayout'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password) { setErr('Please fill in all fields.'); return }
    setLoading(true); setErr('')
    try {
      await login({ email, password })
      navigate('/crm/dashboard')
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Dovvia dashboard"
      footer={
        <>
          New here?{' '}
          <Link to="/crm/register" className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <InputWithIcon icon={<AuthIcons.Mail />}>
            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="pl-11"
              autoComplete="email"
            />
          </InputWithIcon>
        </Field>

        <Field
          label="Password"
          action={
            <Link to="/crm/forgot-password" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
              Forgot?
            </Link>
          }
        >
          <InputWithIcon icon={<AuthIcons.Lock />}>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="pl-11 pr-11"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500 hover:text-ink-base"
            >
              {showPw ? <AuthIcons.EyeOff /> : <AuthIcons.Eye />}
            </button>
          </InputWithIcon>
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-muted dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            className="h-4 w-4 rounded accent-brand-500"
          />
          Remember me
        </label>

        {err && (
          <p className="text-sm rounded-xl bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">
            {err}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full h-12 text-base">
          {loading ? 'Signing in…' : <>Sign in <AuthIcons.ArrowRight /></>}
        </button>
      </form>
    </AuthLayout>
  )
}

export function Field({ label, action, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-ink-strong dark:text-slate-200">{label}</label>
        {action}
      </div>
      {children}
    </div>
  )
}

export function InputWithIcon({ icon, children }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500 pointer-events-none">
        {icon}
      </span>
      {children}
    </div>
  )
}

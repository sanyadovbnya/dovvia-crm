import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../utils/auth'
import { AuthIcons } from './AuthIcons'
import AuthLayout from './AuthLayout'
import { Field, InputWithIcon } from './LoginScreen'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) { setErr('Please enter your email address.'); return }
    setLoading(true); setErr('')
    try { requestPasswordReset(email); setSent(true) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a reset link to ${email}`}>
        <div className="text-center py-2">
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 flex items-center justify-center">
            <AuthIcons.Mail />
          </div>
          <p className="text-sm text-ink-muted dark:text-slate-400 leading-relaxed mb-6">
            If an account exists with this email, you&apos;ll receive a password reset link shortly.
          </p>
          <Link
            to="/crm/login"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <AuthIcons.ArrowLeft /> Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot password?" subtitle="Enter your email and we'll send you a reset link">
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

        {err && (
          <p className="text-sm rounded-xl bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">
            {err}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full h-12 text-base">
          {loading ? 'Sending…' : <>Send reset link <AuthIcons.MailSend /></>}
        </button>
      </form>

      <div className="text-center mt-6">
        <Link
          to="/crm/login"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          <AuthIcons.ArrowLeft /> Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}

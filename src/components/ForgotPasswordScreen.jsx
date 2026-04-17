import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../utils/auth'
import { AuthIcons } from './AuthIcons'
import AuthLayout from './AuthLayout'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) { setErr('Please enter your email address.'); return }
    setLoading(true)
    setErr('')
    try {
      requestPasswordReset(email)
      setSent(true)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check Your Email"
        subtitle={`We sent a reset link to ${email}`}
      >
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: '#052e16', border: '1px solid #166534',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', color: '#4ade80',
          }}>
            <AuthIcons.Mail />
          </div>
          <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 24 }}>
            If an account exists with this email, you'll receive a password reset link shortly.
          </p>
          <Link
            to="/crm/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 14, color: '#2BB5AD', textDecoration: 'none', fontWeight: 500,
            }}
          >
            <AuthIcons.ArrowLeft /> Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Forgot Password?"
      subtitle="Enter your email and we'll send you a reset link"
    >
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Email Address</label>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: '#475569', display: 'flex', pointerEvents: 'none',
          }}>
            <AuthIcons.Mail />
          </span>
          <input
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ paddingLeft: 44, height: 48, fontSize: 14, borderRadius: 10 }}
          />
        </div>

        {err && <p style={{ fontSize: 13, color: '#f87171', marginTop: 16 }}>{err}</p>}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #E8952E, #D4811F)',
          color: '#fff', fontWeight: 600, fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 24,
        }}>
          {loading ? 'Sending…' : 'Send Reset Link'}
          {!loading && <AuthIcons.MailSend />}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Link
          to="/crm/login"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 14, color: '#2BB5AD', textDecoration: 'none', fontWeight: 500,
          }}
        >
          <AuthIcons.ArrowLeft /> Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  )
}

const labelStyle = {
  display: 'block', fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 8,
}

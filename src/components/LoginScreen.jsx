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
    setLoading(true)
    setErr('')
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
      title="Sign In"
      subtitle="Access your Dovvia CRM dashboard"
      footer={
        <p style={{ fontSize: 14, color: '#64748b' }}>
          Don't have an account?{' '}
          <Link to="/crm/register" style={{ color: '#2BB5AD', textDecoration: 'none', fontWeight: 500 }}>
            Create Account
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Email Address</label>
        <div style={inputWrapStyle}>
          <span style={iconStyle}><AuthIcons.Mail /></span>
          <input
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
          <label style={labelStyle}>Password</label>
          <Link to="/crm/forgot-password" style={{ fontSize: 13, color: '#2BB5AD', textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </div>
        <div style={inputWrapStyle}>
          <span style={iconStyle}><AuthIcons.Lock /></span>
          <input
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPw(s => !s)}
            style={togglePwStyle}
          >
            {showPw ? <AuthIcons.EyeOff /> : <AuthIcons.Eye />}
          </button>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 20, fontSize: 14, color: '#94a3b8', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#E8952E' }}
          />
          Remember me
        </label>

        {err && <p style={errStyle}>{err}</p>}

        <button type="submit" disabled={loading} style={submitStyle}>
          {loading ? 'Signing in…' : 'Sign In'}
          {!loading && <AuthIcons.ArrowRight />}
        </button>
      </form>
    </AuthLayout>
  )
}

const labelStyle = {
  display: 'block', fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 8,
}

const inputWrapStyle = {
  position: 'relative',
}

const iconStyle = {
  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
  color: '#475569', display: 'flex', pointerEvents: 'none',
}

const inputStyle = {
  paddingLeft: 44, height: 48, fontSize: 14, borderRadius: 10,
}

const togglePwStyle = {
  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
  background: 'none', border: 'none', color: '#475569', display: 'flex',
  padding: 4,
}

const errStyle = {
  fontSize: 13, color: '#f87171', marginTop: 16,
}

const submitStyle = {
  width: '100%', padding: '14px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #E8952E, #D4811F)',
  color: '#fff', fontWeight: 600, fontSize: 15,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  marginTop: 24,
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../utils/auth'
import { AuthIcons } from './AuthIcons'
import AuthLayout from './AuthLayout'

const BUSINESS_TYPES = [
  { value: 'appliance_repair', label: 'Appliance Repair' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'cleaning', label: 'Cleaning Services' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'home_services', label: 'General Home Services' },
  { value: 'custom', label: 'Custom / Other' },
]

function PasswordCheck({ label, met }) {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 12, color: met ? '#4ade80' : '#475569',
    }}>
      {met ? <AuthIcons.Check /> : <span style={{ width: 12, height: 12, display: 'inline-block' }} />}
      {label}
    </span>
  )
}

export default function RegisterScreen() {
  const [form, setForm] = useState({
    name: '', phone: '', company: '', businessType: 'appliance_repair',
    email: '', password: '', confirmPassword: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  const pw = form.password
  const pwChecks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.company.trim() || !form.email.trim() || !form.password) {
      setErr('Please fill in all required fields.'); return
    }
    if (!pwChecks.length || !pwChecks.upper || !pwChecks.lower || !pwChecks.number) {
      setErr('Password does not meet the requirements.'); return
    }
    if (form.password !== form.confirmPassword) {
      setErr('Passwords do not match.'); return
    }
    if (!agreed) {
      setErr('You must agree to the Terms of Service.'); return
    }
    setLoading(true)
    setErr('')
    try {
      await register(form)
      navigate('/crm/dashboard')
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Start Your Free Trial"
      subtitle="7 days free, no credit card required"
      footer={
        <>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            Already have an account?{' '}
            <Link to="/crm/login" style={{ color: '#2BB5AD', textDecoration: 'none', fontWeight: 500 }}>
              Sign in
            </Link>
          </p>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12,
          }}>
            {['No credit card', 'Cancel anytime', 'Full access'].map(t => (
              <span key={t} style={{ fontSize: 12, color: '#475569' }}>{t}</span>
            ))}
          </div>
        </>
      }
    >
      <div style={{
        background: '#0f1117', border: '1px solid #1e3a2f',
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: '#052e16', border: '1px solid #166534',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#4ade80',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>7-Day Free Trial</p>
          <p style={{ fontSize: 12, color: '#4ade80' }}>Full access to all features · No credit card required</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <p style={sectionLabel}>Personal Info</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Full Name *</label>
            <input placeholder="John Doe" value={form.name} onChange={set('name')} style={{ height: 46 }} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={set('phone')} style={{ height: 46 }} />
          </div>
        </div>

        <p style={{ ...sectionLabel, marginTop: 24 }}>Business Details</p>
        <label style={labelStyle}>Company Name *</label>
        <input placeholder="Your Business Name" value={form.company} onChange={set('company')} style={{ height: 46, marginBottom: 12 }} />

        <label style={labelStyle}>Business Type *</label>
        <select value={form.businessType} onChange={set('businessType')} style={{ height: 46, marginBottom: 4 }}>
          {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <p style={{ fontSize: 12, color: '#475569', marginBottom: 0 }}>
          Pre-configures booking fields · Choose "Custom" to set up manually
        </p>

        <div style={{ borderTop: '1px solid #1e2347', margin: '24px 0' }} />

        <p style={sectionLabel}>Account</p>
        <label style={labelStyle}>Email Address *</label>
        <input type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} style={{ height: 46, marginBottom: 12 }} />

        <label style={labelStyle}>Password *</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            style={{ height: 46, paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPw(s => !s)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: '#475569', display: 'flex', padding: 4,
            }}
          >
            {showPw ? <AuthIcons.EyeOff /> : <AuthIcons.Eye />}
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8, marginBottom: 12 }}>
          <PasswordCheck label="8+ characters" met={pwChecks.length} />
          <PasswordCheck label="Uppercase letter" met={pwChecks.upper} />
          <PasswordCheck label="Lowercase letter" met={pwChecks.lower} />
          <PasswordCheck label="Number" met={pwChecks.number} />
        </div>

        <label style={labelStyle}>Confirm Password *</label>
        <input
          type="password"
          placeholder="••••••••"
          value={form.confirmPassword}
          onChange={set('confirmPassword')}
          style={{ height: 46 }}
        />

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          marginTop: 20, fontSize: 13, color: '#94a3b8', cursor: 'pointer',
          lineHeight: 1.5,
        }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#E8952E', marginTop: 2, flexShrink: 0 }}
          />
          <span>
            I agree to the{' '}
            <Link to="/" style={{ color: '#2BB5AD', textDecoration: 'none' }}>Terms of Service</Link>
            {' '}and{' '}
            <Link to="/" style={{ color: '#2BB5AD', textDecoration: 'none' }}>Privacy Policy</Link>
          </span>
        </label>

        {err && <p style={{ fontSize: 13, color: '#f87171', marginTop: 16 }}>{err}</p>}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #E8952E, #D4811F)',
          color: '#fff', fontWeight: 600, fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 24,
        }}>
          {loading ? 'Creating account…' : 'Start Free Trial'}
        </button>
      </form>
    </AuthLayout>
  )
}

const sectionLabel = {
  fontSize: 11, fontWeight: 600, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 12,
}

const labelStyle = {
  display: 'block', fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 8,
}

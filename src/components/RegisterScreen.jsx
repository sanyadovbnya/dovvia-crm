import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../utils/auth'
import { AuthIcons } from './AuthIcons'
import AuthLayout from './AuthLayout'
import { Field, InputWithIcon } from './LoginScreen'

const BUSINESS_TYPES = [
  { value: 'appliance_repair', label: 'Appliance Repair' },
  { value: 'hvac',             label: 'HVAC' },
  { value: 'plumbing',         label: 'Plumbing' },
  { value: 'electrical',       label: 'Electrical' },
  { value: 'cleaning',         label: 'Cleaning Services' },
  { value: 'landscaping',      label: 'Landscaping' },
  { value: 'pest_control',     label: 'Pest Control' },
  { value: 'locksmith',        label: 'Locksmith' },
  { value: 'home_services',    label: 'General Home Services' },
  { value: 'custom',           label: 'Custom / Other' },
]

function PasswordCheck({ label, met }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs ${met ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-faint dark:text-slate-500'}`}>
      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${met ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
        {met && <AuthIcons.Check />}
      </span>
      {label}
    </span>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-3">
      {children}
    </p>
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

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const pw = form.password
  const pwChecks = {
    length: pw.length >= 8,
    upper:  /[A-Z]/.test(pw),
    lower:  /[a-z]/.test(pw),
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
    if (form.password !== form.confirmPassword) { setErr('Passwords do not match.'); return }
    if (!agreed) { setErr('You must agree to the Terms of Service.'); return }
    setLoading(true); setErr('')
    try {
      await register(form)
      navigate('/dashboard')
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Start your free trial"
      subtitle="7 days free · no credit card required"
      footer={
        <>
          <p>
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold">
              Sign in
            </Link>
          </p>
          <div className="flex justify-center gap-4 mt-2 text-xs text-ink-faint dark:text-slate-500">
            <span>No credit card</span>
            <span>·</span>
            <span>Cancel anytime</span>
            <span>·</span>
            <span>Full access</span>
          </div>
        </>
      }
    >
      {/* Trial banner */}
      <div className="mb-5 rounded-xl bg-pastel-mint dark:bg-emerald-500/15 border border-emerald-200/60 dark:border-emerald-500/20 px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-emerald-200 dark:bg-emerald-500/30 flex items-center justify-center text-pastel-mintDeep dark:text-emerald-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-strong dark:text-slate-100">7-day free trial</p>
          <p className="text-xs text-pastel-mintDeep dark:text-emerald-300">Full access · No credit card required</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <SectionLabel>Personal Info</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name *">
              <input placeholder="John Doe" value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Phone">
              <input type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={set('phone')} />
            </Field>
          </div>
        </div>

        <div>
          <SectionLabel>Business Details</SectionLabel>
          <Field label="Company name *">
            <input placeholder="Your business name" value={form.company} onChange={set('company')} />
          </Field>
          <div className="mt-3">
            <Field label="Business type *">
              <select value={form.businessType} onChange={set('businessType')}>
                {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <p className="mt-1.5 text-xs text-ink-faint dark:text-slate-500">
              Pre-configures booking fields · Pick "Custom" to set up manually
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
          <SectionLabel>Account</SectionLabel>
          <Field label="Email *">
            <input type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} autoComplete="email" />
          </Field>

          <div className="mt-3">
            <Field label="Password *">
              <InputWithIcon icon={<AuthIcons.Lock />}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  className="pl-11 pr-11"
                  autoComplete="new-password"
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
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
              <PasswordCheck label="8+ characters"    met={pwChecks.length} />
              <PasswordCheck label="Uppercase letter" met={pwChecks.upper} />
              <PasswordCheck label="Lowercase letter" met={pwChecks.lower} />
              <PasswordCheck label="Number"           met={pwChecks.number} />
            </div>
          </div>

          <div className="mt-3">
            <Field label="Confirm password *">
              <input
                type="password"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                autoComplete="new-password"
              />
            </Field>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-ink-muted dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded accent-brand-500 flex-shrink-0"
          />
          <span>
            I agree to the{' '}
            <Link to="/" className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/" className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold">Privacy Policy</Link>
          </span>
        </label>

        {err && (
          <p className="text-sm rounded-xl bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">
            {err}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full h-12 text-base">
          {loading ? 'Creating account…' : <>Start free trial <AuthIcons.ArrowRight /></>}
        </button>
      </form>
    </AuthLayout>
  )
}

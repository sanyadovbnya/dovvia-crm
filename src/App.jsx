import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { fetchCalls } from './api/vapi'
import { fmtDuration, callDuration, isBooked, callOutputs } from './utils/formatters'
import { upsertAppointmentsFromCalls } from './utils/appointments'
import { getSession, onAuthChange, logout } from './utils/auth'
import { loadVapiKey, saveVapiKey } from './utils/profile'
import LoginScreen from './components/LoginScreen'
import RegisterScreen from './components/RegisterScreen'
import ForgotPasswordScreen from './components/ForgotPasswordScreen'
import ReviewPage from './components/ReviewPage'
import SetupScreen from './components/SetupScreen'
import StatCard from './components/StatCard'
import CallRow from './components/CallRow'
import CallDetail from './components/CallDetail'
import Calendar from './components/Calendar'
import Stats from './components/Stats'
import Customers from './components/Customers'
import Invoices from './components/Invoices'
import Reviews from './components/Reviews'
import Shell from './components/Shell'
import SettingsModal from './components/SettingsModal'
import { Icons } from './components/Icons'

function Dashboard({ session, onLogout }) {
  const [apiKey, setApiKey] = useState('')
  const [keyLoading, setKeyLoading] = useState(true)
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [tab, setTab] = useState('calls')

  const userMeta = session?.user?.user_metadata || {}
  const company = userMeta.company

  useEffect(() => {
    loadVapiKey().then(key => {
      setApiKey(key)
      setKeyLoading(false)
    })
  }, [])

  const loadCalls = useCallback(async () => {
    if (!apiKey) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchCalls(apiKey, { limit: 100 })
      setCalls(data)
      upsertAppointmentsFromCalls(data)
    } catch (e) {
      setError(e.message || 'Failed to load calls.')
    } finally {
      setLoading(false)
    }
  }, [apiKey])

  useEffect(() => { loadCalls() }, [loadCalls])

  async function handleSaveKey(key) {
    await saveVapiKey(key)
    setApiKey(key)
    setShowSettings(false)
  }

  if (keyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-faint">
        <Icons.Spinner />
      </div>
    )
  }

  if (!apiKey) return <SetupScreen onSave={handleSaveKey} />

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayCalls = calls.filter(c => new Date(c.createdAt) >= today)
  const bookedCalls = calls.filter(isBooked)
  const durations = calls.map(callDuration).filter(d => d !== null)
  const avgDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0

  const filtered = search.trim()
    ? calls.filter(c => {
        const q = search.toLowerCase()
        const o = callOutputs(c)
        return (
          (o.customerName || '').toLowerCase().includes(q) ||
          (o.customerPhone || '').includes(q) ||
          (c.customer?.number || '').includes(q) ||
          (o.serviceType || '').toLowerCase().includes(q) ||
          (o.problem || '').toLowerCase().includes(q) ||
          (o.callSummary || c.analysis?.summary || '').toLowerCase().includes(q)
        )
      })
    : calls

  return (
    <Shell
      company={company}
      tab={tab}
      setTab={setTab}
      onRefresh={loadCalls}
      loading={loading}
      onOpenSettings={() => setShowSettings(true)}
      onLogout={onLogout}
    >
      {showSettings && (
        <SettingsModal
          currentVapiKey={apiKey}
          onSaveVapiKey={handleSaveKey}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Calls"   value={calls.length}        sub="all time"    tone="lavender" icon={<Icons.Phone />} />
        <StatCard label="Today"         value={todayCalls.length}   sub="calls today" tone="sky"      icon={<Icons.Microphone />} />
        <StatCard label="Appointments"  value={bookedCalls.length}  sub="booked total" tone="mint"    icon={<Icons.Calendar />} />
        <StatCard label="Avg Duration"  value={fmtDuration(avgDuration)} sub="per call" tone="peach"  icon={<Icons.Clock />} />
      </div>

      {tab === 'calls' && (
        <section className="mt-6">
          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500"><Icons.Search /></span>
            <input
              placeholder="Search by name, phone, service, problem…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-11"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Call list */}
          <div className="card overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_128px_112px_56px_20px] items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-surface-muted/40 dark:bg-slate-800/40">
              {['Caller', 'Date & Time', 'Status', 'Duration', ''].map((h, i) => (
                <span key={i} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">{h}</span>
              ))}
            </div>

            {loading && calls.length === 0 ? (
              <div className="py-16 text-center text-ink-muted dark:text-slate-400">
                <span className="spinner inline-block mb-3"><Icons.Spinner /></span>
                <p>Loading calls…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-pastel-lavender dark:bg-indigo-500/20 flex items-center justify-center text-pastel-lavDeep dark:text-indigo-300">
                  <Icons.Phone />
                </div>
                <p className="text-ink-strong dark:text-slate-100 font-medium">
                  {search ? 'No calls match your search.' : 'No calls yet.'}
                </p>
                {!search && (
                  <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">When a customer calls Max, they&apos;ll show up here.</p>
                )}
              </div>
            ) : (
              <div>
                {filtered.map(call => (
                  <CallRow
                    key={call.id}
                    call={call}
                    active={selected?.id === call.id}
                    onClick={() => setSelected(selected?.id === call.id ? null : call)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'schedule' && (
        <section className="mt-6">
          <Calendar />
        </section>
      )}

      {tab === 'customers' && (
        <section className="mt-6">
          <Customers />
        </section>
      )}

      {tab === 'invoices' && (
        <section className="mt-6">
          <Invoices />
        </section>
      )}

      {tab === 'reviews' && (
        <section className="mt-6">
          <Reviews />
        </section>
      )}

      {tab === 'stats' && (
        <section className="mt-6">
          <Stats calls={calls} loading={loading} />
        </section>
      )}

      {selected && (
        <CallDetail call={selected} onClose={() => setSelected(null)} />
      )}
    </Shell>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getSession().then(s => {
      setSession(s)
      setLoading(false)
    })
    const subscription = onAuthChange(s => { setSession(s) })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await logout()
    setSession(null)
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-faint">
        <Icons.Spinner />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginScreen />} />
      <Route path="/register" element={session ? <Navigate to="/dashboard" replace /> : <RegisterScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
      <Route path="/r/:token" element={<ReviewPage />} />
      <Route path="/dashboard" element={session ? <Dashboard session={session} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}

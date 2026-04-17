import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { fetchCalls, testConnection } from './api/vapi'
import { fmtDuration, callDuration, isBooked, callOutputs, extractAppointment } from './utils/formatters'
import { upsertAppointmentsFromCalls } from './utils/appointments'
import { getSession, onAuthChange, logout } from './utils/auth'
import { loadVapiKey, saveVapiKey } from './utils/profile'
import LoginScreen from './components/LoginScreen'
import RegisterScreen from './components/RegisterScreen'
import ForgotPasswordScreen from './components/ForgotPasswordScreen'
import SetupScreen from './components/SetupScreen'
import StatCard from './components/StatCard'
import CallRow from './components/CallRow'
import CallDetail from './components/CallDetail'
import Calendar from './components/Calendar'
import { Icons } from './components/Icons'

function SettingsPanel({ currentKey, onSave, onClose }) {
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    const k = (key.trim() || currentKey)
    setTesting(true); setErr('')
    try {
      await testConnection(k)
      onSave(k)
    } catch {
      setErr('Invalid key or connection error.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
      <div className="fade-in" style={{
        position: 'fixed', top: 62, right: 16,
        background: '#13162b', border: '1px solid #1e2347',
        borderRadius: 12, padding: 20, width: 340, zIndex: 60,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>
          Vapi API Key
        </p>
        <input
          type="password"
          placeholder="Enter new API key…"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          style={{ marginBottom: 10 }}
        />
        {err && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{err}</p>}
        <button
          onClick={handleSave}
          disabled={testing}
          style={{
            width: '100%', padding: '9px', borderRadius: 8, border: 'none',
            background: '#E8952E', color: '#fff', fontWeight: 600, fontSize: 13,
          }}
        >
          {testing ? 'Testing…' : 'Save & Reconnect'}
        </button>
      </div>
    </>
  )
}

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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: '#13162b', borderBottom: '1px solid #1e2347',
        padding: '0 24px', height: 58,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30,
            background: 'linear-gradient(135deg, #E8952E, #D4811F)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icons.Wrench size={14} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Dovvia CRM</span>
          {company && (
            <span style={{ fontSize: 12, color: '#475569' }}>{company}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={loadCalls}
            style={{
              background: '#1e2347', border: 'none', borderRadius: 8,
              padding: '7px 12px', color: '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <span className={loading ? 'spinner' : ''} style={{ display: 'inline-flex' }}>
              <Icons.Refresh />
            </span>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            style={{
              background: showSettings ? '#3d2a1a' : '#1e2347',
              border: 'none', borderRadius: 8,
              padding: '7px 12px', color: '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <Icons.Settings /> Settings
          </button>
          <button
            onClick={onLogout}
            style={{
              background: '#1e2347', border: 'none', borderRadius: 8,
              padding: '7px 12px', color: '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <Icons.User /> Sign Out
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          currentKey={apiKey}
          onSave={handleSaveKey}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div style={{
        flex: 1, maxWidth: 1200, width: '100%',
        margin: '0 auto', padding: '24px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14, marginBottom: 24,
        }}>
          <StatCard label="Total Calls" value={calls.length} sub="all time" color="#6366f1" icon={<Icons.Phone />} />
          <StatCard label="Today" value={todayCalls.length} sub="calls today" color="#8b5cf6" icon={<Icons.Microphone />} />
          <StatCard label="Appointments" value={bookedCalls.length} sub="booked total" color="#10b981" icon={<Icons.Calendar />} />
          <StatCard label="Avg Duration" value={fmtDuration(avgDuration)} sub="per call" color="#f59e0b" icon={<Icons.Clock />} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#13162b', borderRadius: 10, padding: 4 }}>
          {[
            { key: 'calls', label: 'Calls', icon: <Icons.Phone /> },
            { key: 'schedule', label: 'Schedule', icon: <Icons.Calendar /> },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                background: tab === t.key ? '#1e2347' : 'transparent',
                color: tab === t.key ? '#f1f5f9' : '#475569',
                fontWeight: 600, fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'calls' ? (
          <>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%',
                transform: 'translateY(-50%)', color: '#475569',
              }}>
                <Icons.Search />
              </span>
              <input
                placeholder="Search by name, phone, appliance, problem…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
            </div>

            {error && (
              <div style={{
                background: '#2d0a0a', border: '1px solid #7f1d1d',
                borderRadius: 10, padding: '12px 16px',
                color: '#f87171', fontSize: 13, marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <div style={{
              background: '#13162b', border: '1px solid #1e2347',
              borderRadius: 14, overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 110px 70px 24px',
                gap: 12, padding: '10px 20px',
                borderBottom: '1px solid #1e2347',
              }}>
                {['Caller', 'Date & Time', 'Status', 'Duration', ''].map((h, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 600, color: '#475569',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {loading && calls.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
                  <span className="spinner" style={{ display: 'inline-block', marginBottom: 12 }}>
                    <Icons.Spinner />
                  </span>
                  <p>Loading calls…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
                  {search ? 'No calls match your search.' : 'No calls yet. Make a test call to Dovvia!'}
                </div>
              ) : (
                filtered.map(call => (
                  <CallRow
                    key={call.id}
                    call={call}
                    active={selected?.id === call.id}
                    onClick={() => setSelected(selected?.id === call.id ? null : call)}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <Calendar />
        )}

        <p style={{ fontSize: 11, color: '#2d3148', textAlign: 'center', marginTop: 16 }}>
          Powered by Vapi · Dovvia AI Receptionist
        </p>
      </div>

      {selected && (
        <CallDetail call={selected} onClose={() => setSelected(null)} />
      )}
    </div>
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
    const subscription = onAuthChange(s => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await logout()
    setSession(null)
    navigate('/crm/login')
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#475569',
      }}>
        <Icons.Spinner />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/crm/login" element={
        session ? <Navigate to="/crm/dashboard" replace /> : <LoginScreen />
      } />
      <Route path="/crm/register" element={
        session ? <Navigate to="/crm/dashboard" replace /> : <RegisterScreen />
      } />
      <Route path="/crm/forgot-password" element={<ForgotPasswordScreen />} />
      <Route path="/crm/dashboard" element={
        session ? <Dashboard session={session} onLogout={handleLogout} /> : <Navigate to="/crm/login" replace />
      } />
      <Route path="*" element={
        <Navigate to={session ? '/crm/dashboard' : '/crm/login'} replace />
      } />
    </Routes>
  )
}

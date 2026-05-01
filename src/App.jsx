import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { fetchCalls } from './api/vapi'
import { fmtDuration, callDuration, isBooked, isWaiting, callOutputs } from './utils/formatters'
import { upsertAppointmentsFromCalls } from './utils/appointments'
import { fetchAllAppointments, groupIntoCustomers } from './utils/customers'
import { fetchInvoices, fmtUSD } from './utils/invoices'
import { fetchReviews, reviewStats } from './utils/reviews'
import { fetchResolutions, indexResolutions } from './utils/resolutions'
import { getSession, onAuthChange, logout } from './utils/auth'
import { loadVapiKey, saveVapiKey, loadProfile } from './utils/profile'
import { ownerFirstName } from './utils/sms'
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
import Leads from './components/Leads'
import Reviews from './components/Reviews'
import DateGroupHeader from './components/DateGroupHeader'
import Pagination, { paginate } from './components/Pagination'
import { groupByDay } from './utils/dates'
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
  const [callsFilter, setCallsFilter] = useState('all') // 'all' | 'booked' | 'waiting' | 'done'
  const [callsPage, setCallsPage] = useState(1)
  const [appointments, setAppointments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [reviews, setReviews] = useState([])
  const [resolutions, setResolutions] = useState({})
  const [invoiceDraft, setInvoiceDraft] = useState(null)

  function generateInvoiceFor(draft) {
    setInvoiceDraft(draft)
    setSelected(null)
    setTab('invoices')
  }

  const userMeta = session?.user?.user_metadata || {}
  const [shopName, setShopName] = useState('')

  // Owner first name powers SMS template ("Hi! This is Mike from …").
  // Derived from auth metadata when present, otherwise sniffed from
  // shopName ("Mike's Repair Shop" → "Mike").
  const ownerName = ownerFirstName({ shopName, user: session?.user })

  // Pull the shop name from the profile (Settings → Shop name) so the
  // sidebar shows the live business name, not whatever was typed at signup.
  // Falls back to the signup-time `company` if shop_name isn't set.
  // Re-runs when the session user changes (login / token refresh that
  // swaps users) so we never display the previous user's shop name.
  useEffect(() => {
    if (!session?.user?.id) return
    let active = true
    loadProfile()
      .then(p => { if (active) setShopName(p?.shop_name || userMeta.company || '') })
      .catch(() => { if (active) setShopName(userMeta.company || '') })
    return () => { active = false }
  }, [session?.user?.id, userMeta.company])

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

  const loadResolutions = useCallback(async () => {
    try {
      const rows = await fetchResolutions()
      setResolutions(indexResolutions(rows))
    } catch { /* table may not exist yet */ }
  }, [])

  useEffect(() => { if (apiKey) loadResolutions() }, [apiKey, loadResolutions])

  useEffect(() => {
    if (!apiKey) return
    if (tab === 'schedule' || tab === 'customers') {
      fetchAllAppointments().then(setAppointments).catch(() => {})
    }
    if (tab === 'invoices') {
      fetchInvoices().then(setInvoices).catch(() => {})
    }
    if (tab === 'reviews') {
      fetchReviews().then(setReviews).catch(() => {})
    }
  }, [apiKey, tab])

  // Snap back to page 1 whenever the visible set changes underneath.
  // Must live above the early returns so React sees the same hook list every render.
  useEffect(() => { setCallsPage(1) }, [callsFilter, search])

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
  const todayStr = today.toISOString().slice(0, 10)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  const weekEndStr = weekEnd.toISOString().slice(0, 10)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthStartStr = monthStart.toISOString().slice(0, 10)

  const todayCalls = calls.filter(c => new Date(c.createdAt) >= today)
  const bookedCalls = calls.filter(isBooked)
  const waitingCalls = calls.filter(isWaiting)
  const doneCalls = calls.filter(c => resolutions[c.id]?.outcome === 'done')
  const durations = calls.map(callDuration).filter(d => d !== null)
  const avgDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0

  // Per-tab stat cards. The Calls stats double as quick filters: clicking
  // Appointments/Waiting flips the chip below; Today resets to the unfiltered
  // list and scrolls to today's section. Total Calls is a "back to all" reset.
  function jumpToCallsToday() {
    setCallsFilter('all')
    setSearch('')
    setCallsPage(1)
    // Wait two frames so the list re-renders before we try to scroll.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById('calls-day-today')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }))
  }
  const callsCards = (
    <>
      <StatCard
        label="Total Calls" value={calls.length} sub="all time" tone="lavender" icon={<Icons.Phone />}
        title="Show all calls"
        onClick={() => { setCallsFilter('all'); setSearch(''); setCallsPage(1) }}
      />
      <StatCard
        label="Today" value={todayCalls.length} sub="calls today" tone="sky" icon={<Icons.Microphone />}
        title="Jump to today's calls"
        onClick={jumpToCallsToday}
      />
      <StatCard
        label="Appointments" value={bookedCalls.length} sub="booked total" tone="mint" icon={<Icons.Calendar />}
        title="Show booked calls"
        onClick={() => { setCallsFilter('booked'); setCallsPage(1) }}
      />
      <StatCard
        label="Waiting" value={waitingCalls.length} sub="want a callback" tone="peach" icon={<Icons.Clock />}
        title="Show waiting callers"
        onClick={() => { setCallsFilter('waiting'); setCallsPage(1) }}
      />
    </>
  )

  const activeAppts = appointments.filter(a => a.status !== 'cancelled')
  const todayAppts = activeAppts.filter(a => a.date === todayStr)
  const weekAppts = activeAppts.filter(a => a.date >= todayStr && a.date < weekEndStr)
  const upcomingAppts = activeAppts.filter(a => a.date >= todayStr)
  const scheduleCards = (
    <>
      <StatCard label="Total Appts"   value={activeAppts.length}    sub="all time"   tone="lavender" icon={<Icons.Calendar />} />
      <StatCard label="Today"         value={todayAppts.length}     sub="scheduled"  tone="sky"      icon={<Icons.Clock />} />
      <StatCard label="This Week"     value={weekAppts.length}      sub="next 7 days" tone="mint"    icon={<Icons.Calendar />} />
      <StatCard label="Upcoming"      value={upcomingAppts.length}  sub="future"     tone="peach"    icon={<Icons.ChevronRight />} />
    </>
  )

  const customers = groupIntoCustomers(appointments)
  const newCustomers = customers.filter(c => c.firstDate >= monthStartStr)
  const customersWithUpcoming = customers.filter(c => c.upcoming > 0)
  const totalVisits = customers.reduce((s, c) => s + c.total, 0)
  const avgVisits = customers.length ? (totalVisits / customers.length).toFixed(1) : '0.0'
  const customersCards = (
    <>
      <StatCard label="Total Customers"  value={customers.length}             sub="all time"     tone="lavender" icon={<Icons.User />} />
      <StatCard label="New This Month"   value={newCustomers.length}          sub="first visit"  tone="sky"      icon={<Icons.User />} />
      <StatCard label="With Upcoming"    value={customersWithUpcoming.length} sub="have appts"   tone="mint"     icon={<Icons.Calendar />} />
      <StatCard label="Avg Visits"       value={avgVisits}                    sub="per customer" tone="peach"    icon={<Icons.BarChart />} />
    </>
  )

  const monthInvoices = invoices.filter(i => (i.created_at || '').slice(0, 10) >= monthStartStr)
  const totalRevenue = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const avgInvoice = invoices.length ? totalRevenue / invoices.length : 0
  const invoicesCards = (
    <>
      <StatCard label="Total Invoices"  value={invoices.length}        sub="all time"   tone="lavender" icon={<Icons.Receipt />} />
      <StatCard label="This Month"      value={monthInvoices.length}   sub="created"    tone="sky"      icon={<Icons.Receipt />} />
      <StatCard label="Total Revenue"   value={fmtUSD(totalRevenue)}   sub="invoiced"   tone="mint"     icon={<Icons.BarChart />} />
      <StatCard label="Avg Invoice"     value={fmtUSD(avgInvoice)}     sub="per invoice" tone="peach"   icon={<Icons.BarChart />} />
    </>
  )

  const rStats = reviewStats(reviews)
  const fiveStarCount = rStats.breakdown.find(b => b.stars === 5)?.count || 0
  const reviewsCards = (
    <>
      <StatCard label="Total Reviews"   value={rStats.total}                    sub="submitted"   tone="lavender" icon={<Icons.Star />} />
      <StatCard label="Avg Rating"      value={rStats.total ? rStats.avg.toFixed(1) : '—'} sub="out of 5" tone="sky" icon={<Icons.Star filled />} />
      <StatCard label="5-Star"          value={fiveStarCount}                   sub="reviews"     tone="mint"     icon={<Icons.Star filled />} />
      <StatCard label="Requests Sent"   value={rStats.sentTotal}                sub={`${rStats.responseRate}% response`} tone="peach" icon={<Icons.Phone />} />
    </>
  )

  const statCards =
    tab === 'schedule'  ? scheduleCards
    : tab === 'customers' ? customersCards
    : tab === 'invoices'  ? invoicesCards
    : tab === 'reviews'   ? reviewsCards
    : tab === 'leads'     ? null
    : tab === 'stats'     ? null
    : callsCards

  const filtered = (() => {
    let pool = calls
    if (callsFilter === 'booked')  pool = pool.filter(isBooked)
    if (callsFilter === 'waiting') pool = pool.filter(isWaiting)
    if (callsFilter === 'done')    pool = pool.filter(c => resolutions[c.id]?.outcome === 'done')
    if (!search.trim()) return pool
    const q = search.toLowerCase()
    return pool.filter(c => {
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
  })()

  const callsPageData = paginate(filtered, callsPage)
  const callDayGroups = groupByDay(callsPageData.items, c => c.createdAt)

  return (
    <Shell
      company={shopName}
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

      {statCards && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards}
        </div>
      )}

      {tab === 'calls' && (
        <section className="mt-6">
          {/* Filter chips */}
          <div className="flex gap-2 mb-3">
            {[
              { key: 'all',     label: 'All',     count: calls.length },
              { key: 'booked',  label: 'Booked',  count: bookedCalls.length },
              { key: 'waiting', label: 'Waiting', count: waitingCalls.length },
              { key: 'done',    label: 'Done',    count: doneCalls.length },
            ].map(f => {
              const active = callsFilter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setCallsFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-surface-muted text-ink-muted hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                >
                  {f.label}
                  <span className={`tabular-nums ${active ? 'opacity-90' : 'opacity-70'}`}>· {f.count}</span>
                </button>
              )
            })}
          </div>

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
              {[
                { label: 'Caller' },
                { label: 'Date & Time', align: 'text-right' },
                { label: 'Status' },
                { label: 'Duration', align: 'text-center' },
                { label: '' },
              ].map((h, i) => (
                <span key={i} className={`text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 ${h.align || ''}`}>{h.label}</span>
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
                  {search ? 'No calls match your search.'
                    : callsFilter === 'waiting' ? 'No callers waiting on Mike.'
                    : callsFilter === 'booked'  ? 'No booked calls yet.'
                    : callsFilter === 'done'    ? 'No completed jobs yet.'
                    : 'No calls yet.'}
                </p>
                {!search && callsFilter === 'all' && (
                  <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">When a customer calls Max, they&apos;ll show up here.</p>
                )}
              </div>
            ) : (
              <div>
                {callDayGroups.map(group => (
                  <div key={group.label}>
                    <DateGroupHeader
                      label={group.label}
                      id={group.label === 'Today' ? 'calls-day-today' : undefined}
                    />
                    {group.items.map(call => (
                      <CallRow
                        key={call.id}
                        call={call}
                        resolution={resolutions[call.id]}
                        active={selected?.id === call.id}
                        onClick={() => setSelected(selected?.id === call.id ? null : call)}
                        shopName={shopName}
                        ownerName={ownerName}
                      />
                    ))}
                  </div>
                ))}
                <Pagination {...callsPageData} onChange={setCallsPage} />
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

      {tab === 'leads' && (
        <section className="mt-6">
          <Leads />
        </section>
      )}

      {tab === 'customers' && (
        <section className="mt-6">
          <Customers onGenerateInvoice={generateInvoiceFor} />
        </section>
      )}

      {tab === 'invoices' && (
        <section className="mt-6">
          <Invoices
            initialDraft={invoiceDraft}
            onConsumeDraft={() => setInvoiceDraft(null)}
          />
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
        <CallDetail
          call={selected}
          resolution={resolutions[selected.id]}
          onResolutionChange={loadResolutions}
          onGenerateInvoice={generateInvoiceFor}
          onClose={() => setSelected(null)}
          shopName={shopName}
          ownerName={ownerName}
        />
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

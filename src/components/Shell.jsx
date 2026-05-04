import { useState } from 'react'
import { Icons } from './Icons'
import { useTheme } from '../utils/theme'
import useDismissOnBack from '../utils/useDismissOnBack'

// Daily-use views — shown directly on the mobile bottom nav.
const PRIMARY_NAV = [
  { key: 'calls',     label: 'Calls',     icon: <Icons.Phone /> },
  { key: 'leads',     label: 'Leads',     icon: <Icons.Inbox /> },
  { key: 'schedule',  label: 'Schedule',  icon: <Icons.Calendar /> },
  { key: 'map',       label: 'Map',       icon: <Icons.MapPin /> },
]

// Less-frequent views — collapsed behind a "More" button on mobile.
const SECONDARY_NAV = [
  { key: 'customers', label: 'Customers', icon: <Icons.User /> },
  { key: 'invoices',  label: 'Invoices',  icon: <Icons.Receipt /> },
  { key: 'reviews',   label: 'Reviews',   icon: <Icons.Star /> },
  { key: 'stats',     label: 'Stats',     icon: <Icons.BarChart /> },
]

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV]

const TAB_SUBTITLE = {
  calls:     'All inbound calls to your AI receptionist',
  leads:     'Web form submissions waiting for a response',
  schedule:  'Upcoming and past appointments',
  map:       'Customer locations across your service area',
  customers: 'Everyone who has booked through Dovvia',
  invoices:  'Bill customers after a completed job',
  reviews:   'Customer feedback and ratings',
  stats:     'Performance and trends',
}

function NavItem({ label, icon, active, onClick, variant = 'side' }) {
  if (variant === 'bottom') {
    return (
      <button
        onClick={onClick}
        className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${active ? 'text-brand-600 dark:text-brand-400' : 'text-ink-muted hover:text-ink-base dark:text-slate-400 dark:hover:text-slate-200'}`}
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${active ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : ''}`}>{icon}</span>
        {label}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-ink-base hover:bg-surface-muted dark:text-slate-300 dark:hover:bg-slate-800'}`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-300' : 'text-ink-muted dark:text-slate-400'}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

// Mobile overflow menu — opens from the More button on the bottom nav.
function MoreSheet({ tab, setTab, onClose }) {
  // Swipe-back closes the sheet (it lives bottom-of-screen on mobile only).
  useDismissOnBack(onClose)
  function pick(key) { setTab(key); onClose() }
  return (
    <>
      <div onClick={onClose} className="lg:hidden fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/60 backdrop-blur-sm" />
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 rounded-t-2xl shadow-pop slide-in pb-safe">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-sm font-bold text-ink-strong dark:text-slate-100">More</p>
          <button onClick={onClose} className="btn-ghost !p-1.5"><Icons.X /></button>
        </div>
        <nav className="px-3 pb-4 space-y-1">
          {SECONDARY_NAV.map(n => (
            <NavItem key={n.key} label={n.label} icon={n.icon} active={tab === n.key} onClick={() => pick(n.key)} />
          ))}
        </nav>
      </div>
    </>
  )
}

export default function Shell({
  company,
  tab,
  setTab,
  onRefresh,
  loading,
  onOpenSettings,
  onLogout,
  children,
}) {
  const { theme, toggle } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)
  const inSecondary = SECONDARY_NAV.some(n => n.key === tab)

  return (
    <div className="min-h-screen bg-surface-page dark:bg-slate-950 flex">
      {/* Sidebar — desktop only. Shows everything; no need to collapse here. */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex-col z-30">
        <div className="px-5 py-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-card">
            <Icons.Wrench size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-ink-strong dark:text-slate-100 leading-tight">Dovvia CRM</p>
            {company && <p className="text-xs text-ink-muted dark:text-slate-400 truncate">{company}</p>}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {ALL_NAV.map(n => (
            <NavItem key={n.key} label={n.label} icon={n.icon} active={tab === n.key} onClick={() => setTab(n.key)} />
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <NavItem
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            icon={theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
            onClick={toggle}
          />
          <NavItem label="Settings" icon={<Icons.Settings />} onClick={onOpenSettings} />
          <NavItem label="Sign out" icon={<Icons.LogOut />} onClick={onLogout} />
        </div>
      </aside>

      {/* Main — bottom padding accounts for the fixed bottom nav PLUS the
          home-indicator safe-area inset on Pro Max devices, so the last
          item in the list isn't hidden behind the tab bar.
          min-w-0 so wide content (long phone numbers, transcripts, etc.)
          doesn't push this flex child wider than the viewport and cause a
          horizontal shift when content loads. */}
      <div className="flex-1 min-w-0 lg:pl-64 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {/* Topbar — pt-safe pushes content below the iOS Dynamic Island /
            notch. Mobile button cluster uses tight !p-2 padding so all four
            icons fit alongside the logo at 320px wide; sm:btn-ghost
            restores the standard padding once we have room. */}
        <header className="sticky top-0 z-20 bg-surface-page/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-100 dark:border-slate-800 pt-safe px-safe">
          <div className="px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
            <div className="lg:hidden flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white">
                <Icons.Wrench size={16} />
              </div>
              <p className="font-bold text-ink-strong dark:text-slate-100 truncate">Dovvia CRM</p>
            </div>

            <div className="hidden lg:block">
              <h1 className="text-2xl font-bold text-ink-strong dark:text-slate-100 capitalize">{tab}</h1>
              <p className="text-sm text-ink-muted dark:text-slate-400">{TAB_SUBTITLE[tab]}</p>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                onClick={onRefresh}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 font-medium p-2 sm:px-3.5 sm:py-2 text-sm transition"
                title="Refresh"
              >
                <span className={loading ? 'spinner' : ''}><Icons.Refresh /></span>
                <span className="hidden sm:inline">{loading ? 'Loading…' : 'Refresh'}</span>
              </button>
              <button
                onClick={toggle}
                className="lg:hidden inline-flex items-center justify-center rounded-xl bg-surface-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white p-2 transition"
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
              </button>
              <button
                onClick={onOpenSettings}
                className="lg:hidden inline-flex items-center justify-center rounded-xl bg-surface-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 p-2 transition"
                title="Settings"
              >
                <Icons.Settings />
              </button>
              <button
                onClick={onLogout}
                className="lg:hidden inline-flex items-center justify-center rounded-xl bg-surface-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-rose-600 dark:text-rose-400 p-2 transition"
                title="Sign out"
              >
                <Icons.LogOut />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-10 py-6">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only. Primary 4 + a More button for the rest.
          pb-safe keeps the home indicator off the tap targets on iPhone
          14/15/+ Pro Max devices. */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex z-30 pb-safe">
        {PRIMARY_NAV.map(n => (
          <NavItem key={n.key} variant="bottom" label={n.label} icon={n.icon} active={tab === n.key} onClick={() => setTab(n.key)} />
        ))}
        <NavItem
          variant="bottom"
          label="More"
          icon={<Icons.Menu />}
          active={inSecondary || moreOpen}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      {moreOpen && <MoreSheet tab={tab} setTab={setTab} onClose={() => setMoreOpen(false)} />}
    </div>
  )
}

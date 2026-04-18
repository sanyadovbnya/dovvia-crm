import { Icons } from './Icons'
import { useTheme } from '../utils/theme'

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

  const navItems = [
    { key: 'calls',    label: 'Calls',    icon: <Icons.Phone /> },
    { key: 'schedule', label: 'Schedule', icon: <Icons.Calendar /> },
    { key: 'stats',    label: 'Stats',    icon: <Icons.BarChart /> },
  ]

  const tabSubtitle = {
    calls:    'All inbound calls to your AI receptionist',
    schedule: 'Upcoming and past appointments',
    stats:    'Performance and trends',
  }

  return (
    <div className="min-h-screen bg-surface-page dark:bg-slate-950 flex">
      {/* Sidebar — desktop only */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex-col z-30">
        <div className="px-5 py-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-card">
            <Icons.Wrench size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-ink-strong dark:text-slate-100 leading-tight">Dovvia</p>
            {company && <p className="text-xs text-ink-muted dark:text-slate-400 truncate">{company}</p>}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(n => (
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
          <NavItem label="Sign out" icon={<Icons.User />} onClick={onLogout} />
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:pl-64 pb-20 lg:pb-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-surface-page/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-100 dark:border-slate-800">
          <div className="px-4 sm:px-6 lg:px-10 py-4 flex items-center justify-between gap-4">
            <div className="lg:hidden flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white">
                <Icons.Wrench size={16} />
              </div>
              <p className="font-bold text-ink-strong dark:text-slate-100">Dovvia</p>
            </div>

            <div className="hidden lg:block">
              <h1 className="text-2xl font-bold text-ink-strong dark:text-slate-100 capitalize">{tab}</h1>
              <p className="text-sm text-ink-muted dark:text-slate-400">{tabSubtitle[tab]}</p>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={onRefresh} className="btn-ghost" title="Refresh">
                <span className={loading ? 'spinner' : ''}><Icons.Refresh /></span>
                <span className="hidden sm:inline">{loading ? 'Loading…' : 'Refresh'}</span>
              </button>
              <button onClick={toggle} className="btn-ghost lg:hidden" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
                {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
              </button>
              <button onClick={onOpenSettings} className="btn-ghost lg:hidden" title="Settings">
                <Icons.Settings />
              </button>
              <button onClick={onLogout} className="btn-ghost lg:hidden" title="Sign out">
                <Icons.User />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-10 py-6">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex z-30">
        {navItems.map(n => (
          <NavItem key={n.key} variant="bottom" label={n.label} icon={n.icon} active={tab === n.key} onClick={() => setTab(n.key)} />
        ))}
      </nav>
    </div>
  )
}

import React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type NavItem = {
  to?: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
}

const IconDashboard = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

const IconSearch = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const IconCompanies = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
)

const IconInvoice = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14H7a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2m-4 0h4m-4 0v4m4-4v4m-4 0H9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14v4h6v-4" />
  </svg>
)

const IconOffer = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const IconDiary = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const IconStats = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const IconTruck = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zM1 3h15v13H1zM16 8h4l3 3v5h-7V8z" />
  </svg>
)

const IconEmail = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const IconSms = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
)

const IconCampaign = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
  </svg>
)

const IconAI = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
  </svg>
)

const IconBank = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l9-3 9 3M3 6v12m18-12v12M3 18h18M12 3v3m0 12v3M6 9h.01M6 13h.01M18 9h.01M18 13h.01M12 9h.01M12 13h.01" />
  </svg>
)

const IconLogout = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
)

const NAV_ITEMS: NavItem[] = [
  { to: '/overview',          label: 'Přehled',         icon: <IconDashboard /> },
  { to: '/search',            label: 'Hledání',         icon: <IconSearch /> },
  { label: 'Fakturace',       icon: <IconInvoice />,    disabled: true },
  { label: 'Nabídky',         icon: <IconOffer />,      disabled: true },
  { label: 'Deník',           icon: <IconDiary />,      disabled: true },
  { label: 'Statistiky',      icon: <IconStats />,      disabled: true },
  { label: 'TruckManager',    icon: <IconTruck />,      disabled: true },
  { label: 'Odeslat e-mail',  icon: <IconEmail />,      disabled: true },
  { label: 'Odeslat SMS',     icon: <IconSms />,        disabled: true },
  { label: 'Kampaně',         icon: <IconCampaign />,   disabled: true },
  { label: 'AI asistent',     icon: <IconAI />,         disabled: true },
  { to: '/bank',              label: 'Banka',           icon: <IconBank /> },
]

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const handleLogout = () => {
    signOut()
    navigate('/login')
  }

  // Zavři sidebar při navigaci
  React.useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  const initials = user?.name
    ? user.name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
    : (user?.username ?? '?').slice(0, 2).toUpperCase()

  const sidebarContent = (
    <>
      {/* User info */}
      <div className="px-4 pt-5 pb-4 border-b border-[#0d7f7f]">
        <p className="text-[10px] uppercase tracking-widest text-teal-300 font-semibold mb-1">Admin</p>
        <div className="flex items-center gap-2">
          <Link to={`/worker/${user?.initials ?? ''}`}
            className="w-8 h-8 rounded-full bg-[#0d8080] hover:bg-[#0f9090] flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors"
            title="Můj profil">
            {initials}
          </Link>
          <span className="text-sm font-medium leading-tight truncate">{user?.name ?? user?.username}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          if (item.disabled || !item.to) {
            return (
              <div key={item.label} className="flex items-center gap-3 px-4 py-2.5 text-sm text-teal-200/60 cursor-default select-none">
                <span className="opacity-50">{item.icon}</span>
                {item.label}
              </div>
            )
          }
          const active = location.pathname.startsWith(item.to)
          return (
            <Link key={item.label} to={item.to}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                active ? 'bg-[#0d8080] text-white font-medium' : 'text-teal-100 hover:bg-[#0d8080]/60 hover:text-white'
              }`}>
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-3 border-t border-[#0d7f7f]">
        <button onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-teal-200 hover:bg-[#0d8080]/60 hover:text-white transition-colors">
          <IconLogout />
          Odhlásit se
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — desktop: always visible, mobile: drawer */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-30
        w-52 flex-shrink-0 flex flex-col bg-[#0a6b6b] text-white
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto md:ml-0">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 bg-[#0a6b6b] px-4 py-3 sticky top-0 z-10">
          <button onClick={() => setSidebarOpen(true)} className="text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-white font-medium text-sm">TM Admin</span>
        </div>
        <div className="p-3 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

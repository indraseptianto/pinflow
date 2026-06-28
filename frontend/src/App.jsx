import { useEffect } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { CalendarDays, Home, Settings } from 'lucide-react'
import HomePage from './pages/Home.jsx'
import Review from './pages/Review.jsx'
import Calendar from './pages/Calendar.jsx'
import SettingsPage from './pages/Settings.jsx'

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function App() {
  useEffect(() => {
    window.__hidePinFlowLoader?.()
  }, [])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff7ed_0,#fafaf9_34rem,#f8fafc_100%)] text-slate-950">
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 text-2xl font-black tracking-tight">
            <span className="h-8 w-8 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 shadow-sm" />
            <span>PinFlow</span>
          </Link>
          <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50/80 p-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  }`
                }
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/review/:pinId" element={<Review />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

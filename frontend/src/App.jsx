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
    <div className="min-h-screen bg-[#f8f6f2] text-slate-950">
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 font-serif text-2xl font-bold tracking-tight">
            <span className="h-9 w-9 rounded-full bg-[#E60023] shadow-lg shadow-red-200" />
            <span>PinFlow</span>
          </Link>
          <div className="flex items-center gap-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-[#E60023] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
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

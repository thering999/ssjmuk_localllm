import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import KeysPage from '@/pages/KeysPage'
import PlaygroundPage from '@/pages/PlaygroundPage'
import FallbackPage from '@/pages/FallbackPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import LoginPage from '@/pages/LoginPage'
import mophLogo from '@/assets/moph-logo.png'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative text-xs font-black px-6 py-2 rounded-full transition-all duration-500 overflow-hidden group/nav ${
          isActive
            ? 'text-white bg-gradient-to-r from-primary via-secondary to-primary shadow-lg scale-105 ring-2 ring-white/30'
            : 'text-muted-foreground hover:text-primary hover:bg-white/50 dark:hover:bg-white/10 shadow-sm'
        }`
      }
    >
      <span className="relative z-10 uppercase tracking-widest">{children}</span>
      <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover/nav:animate-shimmer" />
    </NavLink>
  )
}

function DarkModeToggle() {
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark')
      setDark(true)
    }
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className="size-10 rounded-2xl bg-white/50 dark:bg-white/10 backdrop-blur-3xl border border-white shadow-xl hover:rotate-180 transition-all duration-700">
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </Button>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-4 group cursor-pointer">
      <div className="relative size-12 flex items-center justify-center bg-white rounded-2xl shadow-xl border-2 border-primary/20 p-1.5 group-hover:scale-105 transition-all duration-500 ring-4 ring-primary/5">
        <img src={mophLogo} alt="Logo" className="size-full object-contain animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="font-black tracking-tighter text-2xl leading-none text-neon- master bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-accent animate-gradient drop-shadow-sm">สสจ.มุกดาหาร</span>
        <span className="text-[9px] text-muted-foreground font-black leading-tight uppercase tracking-[0.2em] opacity-80 mt-0.5">Provincial Health Office</span>
      </div>
    </div>
  )
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('admin_token'));

  function handleLogout() {
    localStorage.removeItem('admin_token');
    setIsLoggedIn(false);
    window.location.href = '/login';
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className="min-h-screen relative overflow-hidden transition-colors duration-1000 selection:bg-primary/50">
          {/* SUPREME LIVING AURA BACKGROUND */}
          <div className="fixed inset-0 z-0 pointer-events-none">
            <div className="absolute top-[-20%] left-[-10%] size-[80%] rounded-full bg-primary/10 blur-[150px] animate-supreme-aura" />
            <div className="absolute bottom-[-20%] right-[-10%] size-[80%] rounded-full bg-secondary/15 blur-[150px] animate-supreme-aura" style={{ animationDelay: '-8s' }} />
          </div>

          <header className="sticky top-0 z-50 h-20 flex items-center bg-white/20 dark:bg-black/20 backdrop-blur-[60px] border-b border-white/40 shadow-xl shadow-primary/5">
            <div className="max-w-6xl mx-auto w-full px-8 flex items-center justify-between">
              <Brand />
              <div className="flex items-center gap-8">
                <nav className="flex items-center gap-3 bg-white/60 dark:bg-black/40 p-1.5 rounded-full border border-white shadow-xl backdrop-blur-3xl ring-2 ring-white/10">
                  <NavItem to="/playground">Playground</NavItem>
                  {isLoggedIn && (
                    <>
                      <NavItem to="/keys">Keys</NavItem>
                      <NavItem to="/fallback">Fallback</NavItem>
                      <NavItem to="/analytics">Analytics</NavItem>
                    </>
                  )}
                </nav>
                <div className="flex items-center gap-4">
                  <DarkModeToggle />
                  {isLoggedIn ? (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleLogout}
                      className="rounded-full px-5 font-black uppercase tracking-widest text-[10px] text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all h-9"
                    >
                      Logout
                    </Button>
                  ) : (
                    <NavLink to="/login">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="rounded-full px-5 font-black uppercase tracking-widest text-[10px] text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all h-9"
                      >
                        Admin
                      </Button>
                    </NavLink>
                  )}
                </div>
              </div>
            </div>
          </header>
          
          <main className="max-w-6xl mx-auto px-8 py-10 relative z-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <Routes>
              <Route path="/" element={<Navigate to="/playground" replace />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/login" element={<LoginPage onLogin={() => setIsLoggedIn(true)} />} />
              <Route path="/keys" element={<ProtectedRoute><KeysPage /></ProtectedRoute>} />
              <Route path="/fallback" element={<ProtectedRoute><FallbackPage /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
              <Route path="/test" element={<Navigate to="/playground" replace />} />
              <Route path="/health" element={<Navigate to="/keys" replace />} />
            </Routes>
          </main>
          
          {/* Footer Glow */}
          <div className="fixed bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-accent animate-gradient shadow-[0_0_20px_var(--primary)]" />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

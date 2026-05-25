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
        `relative text-sm font-black px-8 py-3 rounded-full transition-all duration-700 overflow-hidden group/nav ${
          isActive
            ? 'text-white bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_15px_30px_-5px_rgba(var(--primary),0.8)] scale-110 ring-4 ring-white/30'
            : 'text-muted-foreground hover:text-primary hover:bg-white/80 dark:hover:bg-white/10 shadow-lg'
        }`
      }
    >
      <span className="relative z-10 uppercase tracking-[0.4em] transition-transform group-hover/nav:scale-110 inline-block font-black drop-shadow-2xl">{children}</span>
      <div className="absolute inset-0 bg-white/30 -translate-x-full group-hover/nav:animate-shimmer" />
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
    <Button variant="ghost" size="icon" onClick={toggle} className="size-14 rounded-3xl bg-white/60 dark:bg-white/10 backdrop-blur-3xl border-2 border-white shadow-3xl hover:rotate-[360deg] transition-all duration-1000 group">
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-accent group-hover:scale-125 transition-transform"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-secondary group-hover:scale-125 transition-transform"><path d="M12 3a6 6 0 0 0 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </Button>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-6 group cursor-pointer p-2">
      <div className="relative size-20 flex items-center justify-center bg-white rounded-2xl shadow-[0_20px_50px_-10px_rgba(var(--primary),0.5)] border-4 border-primary/20 p-3 group-hover:scale-110 transition-all duration-1000 group-hover:rotate-[360deg] ring-8 ring-primary/5">
        <div className="absolute inset-[-15px] rounded-[2.5rem] border-[6px] border-dashed border-primary/40 animate-spin-slow opacity-40 group-hover:opacity-100 transition-opacity" />
        <img src={mophLogo} alt="Logo" className="size-full object-contain animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="font-black tracking-tighter text-4xl leading-none text-neon-master drop-shadow-[0_15px_30px_rgba(0,0,0,0.3)]">สสจ.มุกดาหาร</span>
        <span className="text-[11px] text-muted-foreground font-black leading-tight uppercase tracking-[0.5em] opacity-90 mt-2 ml-1 border-l-4 border-primary pl-4">Provincial Health Office</span>
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
        <div className="min-h-screen relative overflow-hidden transition-colors duration-1000 selection:bg-secondary">
          {/* SUPREME LIVING AURA BACKGROUND */}
          <div className="fixed inset-0 z-0 pointer-events-none">
            <div className="absolute top-[-30%] left-[-20%] size-[120%] rounded-full bg-primary/40 blur-[250px] animate-floating" />
            <div className="absolute bottom-[-30%] right-[-20%] size-[120%] rounded-full bg-secondary/40 blur-[250px] animate-floating" style={{ animationDelay: '-10s' }} />
            <div className="absolute top-[20%] right-[-10%] size-[90%] rounded-full bg-accent/30 blur-[200px] animate-floating" style={{ animationDelay: '-20s' }} />
            
            {/* Animated Stardust */}
            <div className="absolute inset-0 opacity-15 mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] scale-[2]" />
          </div>

          <header className="sticky top-0 z-50 h-36 flex items-center bg-white/10 dark:bg-black/10 backdrop-blur-[150px] border-b-8 border-white/60 dark:border-white/10 shadow-[0_50px_150px_-20px_rgba(0,0,0,0.4)]">
            <div className="max-w-[1500px] mx-auto w-full px-12 flex items-center justify-between">
              <Brand />
              <div className="flex items-center gap-12">
                <nav className="flex items-center gap-8 bg-white/80 dark:bg-black/60 p-4 rounded-[4rem] border-4 border-white shadow-3xl backdrop-blur-3xl ring-[20px] ring-white/10 transition-all hover:ring-primary/20">
                  <NavItem to="/playground">Playground</NavItem>
                  {isLoggedIn && (
                    <>
                      <NavItem to="/keys">Keys</NavItem>
                      <NavItem to="/fallback">Fallback</NavItem>
                      <NavItem to="/analytics">Analytics</NavItem>
                    </>
                  )}
                </nav>
                <div className="flex items-center gap-10">
                  <DarkModeToggle />
                  {isLoggedIn ? (
                    <Button 
                      variant="ghost" 
                      size="lg" 
                      onClick={handleLogout}
                      className="h-16 rounded-[2.5rem] px-10 font-black uppercase tracking-[0.2em] text-[12px] text-destructive hover:bg-destructive hover:text-white border-4 border-destructive/20 hover:border-destructive shadow-3xl transition-all active:scale-90"
                    >
                      Logout
                    </Button>
                  ) : (
                    <NavLink to="/login">
                      <Button 
                        variant="ghost" 
                        size="lg"
                        className="h-16 rounded-[2.5rem] px-10 font-black uppercase tracking-[0.2em] text-[12px] text-primary hover:bg-primary hover:text-white border-4 border-primary/20 hover:border-primary shadow-3xl transition-all active:scale-90"
                      >
                        Admin
                      </Button>
                    </NavLink>
                  )}
                </div>
              </div>
            </div>
          </header>
          
          <main className="max-w-[1500px] mx-auto px-12 py-20 relative z-10 animate-in fade-in slide-in-from-bottom-20 duration-1000">
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
          
          {/* Supreme Infinite Horizon Glow */}
          <div className="fixed bottom-0 left-0 right-0 h-4 bg-gradient-to-r from-primary via-secondary to-accent bg-[length:200%_auto] animate-plasma shadow-[0_-20px_100px_var(--primary)] border-t-4 border-white/20" />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

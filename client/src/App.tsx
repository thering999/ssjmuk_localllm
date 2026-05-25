import { useState } from 'react'
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
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative text-[10px] font-black px-6 py-2 rounded-full transition-all duration-500 overflow-hidden group/nav uppercase tracking-widest ${
          isActive
            ? 'text-white bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_20px_rgba(74,222,128,0.4)] scale-105 ring-2 ring-white/30'
            : 'text-muted-foreground hover:text-primary hover:bg-white/10'
        }`
      }
    >
      <span className="relative z-10">{children}</span>
    </NavLink>
  )
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('admin_token'));

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className="min-h-screen relative overflow-hidden bg-zinc-950 text-white selection:bg-primary/40">
          
          <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
             <div className="absolute top-[-20%] left-[-10%] size-[100%] rounded-full bg-primary/20 blur-[150px] animate-aura-vivid" />
             <div className="absolute bottom-[-30%] right-[-10%] size-[100%] rounded-full bg-secondary/30 blur-[180px] animate-aura-vivid" style={{ animationDelay: '-5s' }} />
             <div className="absolute top-[30%] right-[-20%] size-[80%] rounded-full bg-accent/20 blur-[200px] animate-aura-vivid" style={{ animationDelay: '-10s' }} />
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
          </div>

          <header className="sticky top-0 z-50 h-16 flex items-center bg-black/40 backdrop-blur-[100px] border-b border-white/10 shadow-2xl">
            <div className="max-w-[1700px] mx-auto w-full px-8 flex items-center justify-between">
              <div className="flex items-center gap-4 group">
                <div className="size-10 bg-white rounded-xl shadow-xl border-2 border-primary/20 p-1 group-hover:scale-110 transition-transform duration-500">
                  <img src={mophLogo} alt="Logo" className="size-full object-contain" />
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-xl leading-none text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent animate-plasma tracking-tighter uppercase">สสจ.มุกดาหาร</span>
                  <span className="text-[7px] font-bold text-white/40 uppercase tracking-[0.4em] leading-none mt-1">Intelligence Unit Portal</span>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <nav className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-3xl">
                  <NavItem to="/playground">Playground</NavItem>
                  {isLoggedIn && (
                    <>
                      <NavItem to="/keys">Keys</NavItem>
                      <NavItem to="/fallback">Fallback</NavItem>
                      <NavItem to="/analytics">Analytics</NavItem>
                    </>
                  )}
                </nav>
                {isLoggedIn ? (
                    <Button onClick={() => { localStorage.removeItem('admin_token'); setIsLoggedIn(false); window.location.href='/login'; }} variant="ghost" size="sm" className="rounded-full px-5 font-black uppercase tracking-widest text-[9px] text-destructive hover:bg-destructive/10 border border-destructive/20 h-8">Logout</Button>
                ) : (
                    <NavLink to="/login"><Button variant="ghost" size="sm" className="rounded-full px-5 font-black uppercase tracking-widest text-[9px] text-primary hover:bg-primary/10 border border-primary/20 h-8">Admin</Button></NavLink>
                )}
              </div>
            </div>
          </header>
          
          <main className="max-w-[1750px] mx-auto px-6 py-6 relative z-10">
            <Routes>
              <Route path="/" element={<Navigate to="/playground" replace />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/login" element={<LoginPage onLogin={() => setIsLoggedIn(true)} />} />
              <Route path="/keys" element={<ProtectedRoute><KeysPage /></ProtectedRoute>} />
              <Route path="/fallback" element={<ProtectedRoute><FallbackPage /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            </Routes>
          </main>
          
          <div className="fixed bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-secondary to-accent opacity-50 shadow-[0_0_20px_var(--primary)]" />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

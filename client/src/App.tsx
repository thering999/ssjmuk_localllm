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
            ? 'text-white bg-gradient-to-r from-emerald-500 via-blue-600 to-emerald-500 shadow-[0_0_20px_rgba(74,222,128,0.4)] scale-105 ring-2 ring-white/30'
            : 'text-zinc-500 hover:text-emerald-400 hover:bg-white/10'
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
        <div className="min-h-screen relative overflow-hidden bg-zinc-950 text-white selection:bg-emerald-500/40">
          
          <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#09090b]">
             <div className="absolute top-[-25%] left-[-15%] size-[120%] rounded-full bg-emerald-500/10 blur-[180px] aura-primary" />
             <div className="absolute bottom-[-30%] right-[-15%] size-[120%] rounded-full bg-blue-600/15 blur-[200px] aura-secondary" />
             <div className="absolute top-[20%] right-[-20%] size-[90%] rounded-full bg-purple-600/10 blur-[220px] aura-accent" />
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-40 mix-blend-overlay" />
          </div>

          <header className="sticky top-0 z-50 h-16 flex items-center bg-black/60 backdrop-blur-[120px] border-b border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <div className="max-w-[1700px] mx-auto w-full px-8 flex items-center justify-between">
              <div className="flex items-center gap-4 group">
                <div className="size-11 bg-white rounded-2xl shadow-2xl border-2 border-emerald-500/20 p-1.5 group-hover:scale-110 transition-transform duration-700">
                  <img src={mophLogo} alt="Logo" className="size-full object-contain" />
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-2xl leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-blue-500 to-emerald-400 animate-plasma-vivid tracking-tighter uppercase">สสจ.มุกดาหาร</span>
                  <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.6em] leading-none mt-1">Intelligence Division</span>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <nav className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/5 backdrop-blur-3xl shadow-inner">
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
                    <Button onClick={() => { localStorage.removeItem('admin_token'); setIsLoggedIn(false); window.location.href='/login'; }} variant="ghost" size="sm" className="rounded-full px-6 bg-red-600/10 text-red-500 border border-red-500/20 font-black uppercase text-[9px] hover:bg-red-600 hover:text-white transition-all h-9">Logout</Button>
                ) : (
                    <NavLink to="/login"><Button variant="ghost" size="sm" className="rounded-full px-6 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-black uppercase text-[9px] hover:bg-emerald-500 hover:text-white transition-all h-9">Admin Access</Button></NavLink>
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
          
          <div className="fixed bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-blue-600 to-purple-600 opacity-60 shadow-[0_0_30px_#10b981]" />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

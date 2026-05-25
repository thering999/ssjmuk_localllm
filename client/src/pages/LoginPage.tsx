import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage({ onLogin }: { onLogin?: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await apiFetch<{ success: boolean; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })

      if (res.token) {
        localStorage.setItem('admin_token', res.token)
        onLogin?.()
        navigate('/keys')
      }
    } catch (err: any) {
      setError(err.message || 'รหัสผ่านไม่ถูกต้อง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="text-center space-y-2">
          <div className="size-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl border border-primary/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-primary uppercase tracking-tighter">Admin Access</h1>
          <p className="text-muted-foreground font-bold">กรุณาป้อนรหัสผ่านเพื่อเข้าสู่โหมดตั้งค่า</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/40 dark:bg-black/20 backdrop-blur-3xl p-10 rounded-[2.5rem] border border-white/40 shadow-2xl space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-4">Password</Label>
            <Input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-14 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border-white/40 shadow-inner px-6 font-mono text-center text-lg"
            />
          </div>

          {error && (
            <p className="text-destructive text-xs font-bold text-center animate-in shake-200">{error}</p>
          )}

          <Button 
            type="submit" 
            size="lg" 
            disabled={loading || !password} 
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-secondary font-black uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all"
          >
            {loading ? 'Verifying...' : 'Unlock Dashboard'}
          </Button>
        </form>
        
        <p className="text-[9px] text-center text-muted-foreground font-black uppercase tracking-[0.3em] opacity-40">
           กรุณาติดต่อแอดมิน สสจ.มุกดาหาร หากจำรหัสผ่านไม่ได้
        </p>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'
import type { ApiKey, Platform } from '../../../shared/types'

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'google', label: 'Google AI Studio' },
  { value: 'groq', label: 'Groq' },
  { value: 'cerebras', label: 'Cerebras' },
  { value: 'sambanova', label: 'SambaNova' },
  { value: 'nvidia', label: 'NVIDIA NIM' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'github', label: 'GitHub Models' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'cloudflare', label: 'Cloudflare Workers AI' },
  { value: 'zhipu', label: 'Zhipu AI (Z.ai)' },
  { value: 'ollama', label: 'Ollama Cloud' },
  { value: 'kilo', label: 'Kilo Gateway (anon ok)' },
  { value: 'pollinations', label: 'Pollinations (anon ok)' },
  { value: 'llm7', label: 'LLM7 (anon ok)' },
]

const statusDot: Record<string, string> = {
  healthy: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
  rate_limited: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]',
  invalid: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]',
  error: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]',
  unknown: 'bg-muted-foreground/40',
}

const statusLabel: Record<string, string> = {
  healthy: 'healthy',
  rate_limited: 'rate-limited',
  invalid: 'invalid',
  error: 'error',
  unknown: 'unchecked',
}

interface HealthPlatform {
  platform: string
  totalKeys: number
  healthyKeys: number
  rateLimitedKeys: number
  invalidKeys: number
  errorKeys: number
  unknownKeys: number
}

interface HealthData {
  platforms: HealthPlatform[]
  keys: { id: number; platform: string; status: string; lastCheckedAt: string | null }[]
}

function UnifiedKeySection() {
  const queryClient = useQueryClient()
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data } = useQuery<{ apiKey: string }>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  const regenerate = useMutation({
    mutationFn: () => apiFetch('/api/settings/api-key/regenerate', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['unified-key'] }),
  })

  const apiKey = data?.apiKey ?? ''
  const masked = apiKey ? apiKey.slice(0, 13) + '•'.repeat(32) : '…'
  const baseUrl = import.meta.env.DEV
    ? `http://${window.location.hostname}:3001/v1`
    : `${window.location.origin}/v1`

  function copy() {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="rounded-[2.5rem] border border-white/40 bg-white/40 dark:bg-black/20 backdrop-blur-3xl p-8 shadow-2xl transition-all hover:shadow-primary/10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-primary">Unified API Key</h2>
          <p className="text-xs text-muted-foreground mt-1 font-bold">
            ระบบคีย์รวมศูนย์สำหรับการเชื่อมต่อแอปพลิเคชันภายนอก
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full px-4 font-black uppercase text-[10px] hover:bg-primary/10 text-primary"
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending}
        >
          Regenerate
        </Button>
      </div>

      <div className="flex items-center gap-3 bg-white/60 dark:bg-black/40 p-1.5 rounded-3xl border border-white/40 shadow-inner">
        <code className="flex-1 font-mono text-xs px-4 py-3 rounded-2xl select-all truncate tabular-nums font-bold text-primary bg-white/80 dark:bg-zinc-900/80">
          {showKey ? apiKey : masked}
        </code>
        <div className="flex gap-1.5 pr-1.5">
           <Button variant="ghost" size="icon" className="size-10 rounded-2xl hover:bg-primary/10" onClick={() => setShowKey(!showKey)}>
              {showKey ? 
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9.88 9.88L3 3m7.95 11.05L21 21m-6.17-6.17a3 3 0 0 0-4.24-4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.52 13.16 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/></svg> : 
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              }
           </Button>
           <Button variant="default" size="sm" className="rounded-2xl px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={copy}>
             {copied ? 'Copied' : 'Copy Key'}
           </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white/20 dark:bg-white/5 border border-white/20">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-50">API Base URL</span>
           <code className="font-mono text-xs font-bold text-secondary">{baseUrl}</code>
        </div>
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white/20 dark:bg-white/5 border border-white/20">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Default Model</span>
           <code className="font-mono text-xs font-bold text-primary">auto</code>
        </div>
      </div>
    </section>
  )
}

export default function KeysPage() {
  const queryClient = useQueryClient()
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [label, setLabel] = useState('')

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })

  const { data: healthData } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health'),
    refetchInterval: 30000,
  })

  const addKey = useMutation({
    mutationFn: (body: { platform: string; key: string; label?: string }) =>
      apiFetch('/api/keys', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      setPlatform('')
      setApiKey('')
      setAccountId('')
      setLabel('')
    },
  })

  const deleteKey = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })

  const checkAll = useMutation({
    mutationFn: () => apiFetch('/api/health/check-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const checkKey = useMutation({
    mutationFn: (keyId: number) => apiFetch(`/api/health/check/${keyId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const needsAccountId = platform === 'cloudflare'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!platform || !apiKey) return
    if (needsAccountId && !accountId) return
    const key = needsAccountId ? `${accountId}:${apiKey}` : apiKey
    addKey.mutate({ platform, key, label: label || undefined })
  }

  const healthKeyMap = new Map<number, { status: string; lastCheckedAt: string | null }>()
  for (const k of healthData?.keys ?? []) healthKeyMap.set(k.id, k)

  const grouped = PLATFORMS.map(p => ({
    ...p,
    keys: keys.filter(k => k.platform === p.value),
  })).filter(p => p.keys.length > 0)

  return (
    <div className="space-y-12 animate-in fade-in duration-1000 max-w-6xl mx-auto">
      <PageHeader
        title="Key Management"
        description="การจัดการชุดรหัสผ่านและคีย์สำหรับการเชื่อมต่อโมเดล AI"
        actions={
          keys.length > 0 && (
            <Button variant="default" size="sm" className="rounded-full px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={() => checkAll.mutate()} disabled={checkAll.isPending}>
              {checkAll.isPending ? 'Validating...' : 'Check All Keys'}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-12">
        <UnifiedKeySection />

        <section className="rounded-[2.5rem] border border-white/40 bg-white/40 dark:bg-black/20 backdrop-blur-3xl p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 size-32 bg-primary/10 blur-3xl -mr-10 -mt-10" />
          <h2 className="text-xl font-black uppercase tracking-tighter text-primary mb-8 flex items-center gap-3">
             <div className="size-3 rounded-full bg-primary animate-ping" />
             Add New AI Provider
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-4">Platform Provider</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger className="h-14 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border-white/40 shadow-inner px-6 font-bold">
                  <SelectValue placeholder="เลือกแพลตฟอร์ม..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-white/20">
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.value} value={p.value} className="font-bold">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-4">Label Name</Label>
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="ชื่อเรียกคีย์นี้ (ถ้ามี)"
                className="h-14 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border-white/40 shadow-inner px-6 font-bold"
              />
            </div>
            {needsAccountId && (
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-4">Account ID</Label>
                <Input
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  placeholder="Cloudflare ID"
                  className="h-14 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border-white/40 shadow-inner px-6 font-mono text-xs font-bold"
                />
              </div>
            )}
            <div className={`space-y-2 ${needsAccountId ? '' : 'md:col-span-2'}`}>
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-4">{needsAccountId ? 'API Token' : 'API Secret Key'}</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="วาง API Key ที่ได้รับจาก Provider..."
                className="h-14 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border-white/40 shadow-inner px-6 font-mono text-xs font-bold"
              />
            </div>
            <div className="md:col-span-2 mt-4">
              <Button type="submit" size="lg" className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-secondary font-black uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all" disabled={!platform || !apiKey || (needsAccountId && !accountId) || addKey.isPending}>
                {addKey.isPending ? 'Registering Key...' : 'Register New API Key'}
              </Button>
            </div>
          </form>
          {addKey.isError && (
            <div className="mt-4 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold animate-in shake-200">
               ⚠️ {(addKey.error as Error).message}
            </div>
          )}
        </section>

        <section className="space-y-8">
          <h2 className="text-xl font-black uppercase tracking-tighter text-primary flex items-center gap-3">
             <div className="size-3 rounded-full bg-secondary animate-pulse" />
             Active Key Inventory
          </h2>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center font-black uppercase tracking-widest animate-pulse">Scanning Keys...</div>
          ) : keys.length === 0 ? (
            <div className="rounded-[2.5rem] border-4 border-dashed border-white/40 p-20 text-center bg-white/20">
              <p className="text-lg font-black text-muted-foreground uppercase tracking-widest opacity-40">
                No Active Keys Detected
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-10">
              {grouped.map(group => (
                <div key={group.value} className="space-y-4">
                  <div className="flex items-center justify-between px-6">
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-secondary">{group.label}</h3>
                    <span className="text-[10px] font-black bg-white/40 px-3 py-1 rounded-full border border-white/40 shadow-sm uppercase tabular-nums">
                      {group.keys.length} Key{group.keys.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="rounded-[2rem] border border-white/40 bg-white/40 dark:bg-black/20 backdrop-blur-2xl divide-y divide-white/20 overflow-hidden shadow-2xl">
                    {group.keys.map(k => {
                      const h = healthKeyMap.get(k.id)
                      const status = h?.status ?? k.status
                      const lastChecked = h?.lastCheckedAt
                      return (
                        <div key={k.id} className="flex items-center gap-6 px-8 py-5 hover:bg-white/40 dark:hover:bg-white/5 transition-all group">
                          <div className={`size-3 rounded-full flex-shrink-0 ${statusDot[status] ?? statusDot.unknown} ring-4 ring-white/20`} />
                          <div className="flex flex-col gap-1 min-w-[200px]">
                             <code className="text-[13px] font-mono font-black text-primary tracking-tight">{k.maskedKey}</code>
                             {k.label && <span className="text-[10px] font-bold opacity-60 uppercase">{k.label}</span>}
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${status === 'healthy' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'}`}>
                             {statusLabel[status] ?? status}
                          </span>
                          <div className="flex-1" />
                          {lastChecked && (
                            <span className="text-[10px] font-bold opacity-40 tabular-nums uppercase">
                               Last Checked: {new Date(lastChecked).toLocaleTimeString()}
                            </span>
                          )}
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="xs" className="rounded-xl px-3 font-bold hover:bg-primary/20 hover:text-primary" onClick={() => checkKey.mutate(k.id)} disabled={checkKey.isPending}>
                              Validate
                            </Button>
                            <Button variant="ghost" size="xs" className="rounded-xl px-3 font-bold text-destructive hover:bg-destructive/10" onClick={() => deleteKey.mutate(k.id)} disabled={deleteKey.isPending}>
                              Eject
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

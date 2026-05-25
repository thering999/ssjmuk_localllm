import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, AreaChart, Area
} from 'recharts'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'

type TimeRange = '24h' | '7d' | '30d'

function formatTokens(n?: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function Stat({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-3xl border border-white/40 bg-white/40 dark:bg-black/20 backdrop-blur-2xl px-6 py-5 shadow-xl transition-transform hover:scale-105">
      <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{label}</p>
      <p className={`text-2xl font-black tabular-nums mt-2 text-primary tracking-tighter ${className ?? ''}`}>{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[2.5rem] border border-white/40 bg-white/40 dark:bg-black/20 backdrop-blur-3xl overflow-hidden shadow-2xl transition-all hover:shadow-primary/5">
      <div className="px-8 py-5 border-b border-white/20 bg-white/20 dark:bg-white/5 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary">{title}</h3>
        <div className="size-2 rounded-full bg-primary animate-pulse" />
      </div>
      <div className="p-8">{children}</div>
    </div>
  )
}

const axisStyle = { fontSize: 10, fontWeight: '900', fill: 'var(--muted-foreground)' } as const
const gridStyle = 'rgba(0,0,0,0.05)'

export default function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>('7d')

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary', range],
    queryFn: () => apiFetch<any>(`/api/analytics/summary?range=${range}`),
  })

  const { data: byPlatform = [] } = useQuery({
    queryKey: ['analytics', 'by-platform', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/by-platform?range=${range}`),
  })

  const { data: timeline = [] } = useQuery({
    queryKey: ['analytics', 'timeline', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/timeline?range=${range}`),
  })

  const { data: byModel = [] } = useQuery({
    queryKey: ['analytics', 'by-model', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/by-model?range=${range}`),
  })

  const { data: errors = [] } = useQuery({
    queryKey: ['analytics', 'errors', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/errors?range=${range}`),
  })

  const { data: errorDist } = useQuery({
    queryKey: ['analytics', 'error-distribution', range],
    queryFn: () => apiFetch<{ byCategory: any[]; byPlatform: any[]; detailed: any[] }>(`/api/analytics/error-distribution?range=${range}`),
  })

  return (
    <div className="space-y-12 pb-20 animate-in fade-in duration-1000">
      <PageHeader
        title="Intelligence Analytics"
        description="การวิเคราะห์ข้อมูลการใช้งาน AI แบบเรียลไทม์ (สสจ.มุกดาหาร)"
        actions={
          <div className="flex gap-1.5 bg-white/40 dark:bg-black/20 p-1.5 rounded-full border border-white/40 shadow-xl backdrop-blur-md">
            {(['24h', '7d', '30d'] as TimeRange[]).map(r => (
              <Button
                key={r}
                variant={range === r ? 'secondary' : 'ghost'}
                size="sm"
                className={`rounded-full px-5 font-black uppercase tracking-widest text-[10px] ${range === r ? 'bg-primary text-white shadow-lg' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        }
      />

      <div className="space-y-10">
        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          <Stat label="Total Requests" value={summary?.totalRequests ?? 0} />
          <Stat label="Success Rate" value={`${summary?.successRate ?? 0}%`} className={summary?.successRate > 80 ? 'text-emerald-500' : 'text-primary'} />
          <Stat label="Input Tokens" value={formatTokens(summary?.totalInputTokens)} />
          <Stat label="Output Tokens" value={formatTokens(summary?.totalOutputTokens)} />
          <Stat label="Avg Latency" value={`${summary?.avgLatencyMs ?? 0} ms`} />
          <Stat label="Est. Savings" value={`฿${(parseFloat(summary?.estimatedCostSavings ?? '0') * 35).toFixed(2)}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <Panel title="Request Volume by Platform">
            {byPlatform.length === 0 ? (
              <div className="h-60 flex items-center justify-center font-black uppercase tracking-[0.2em] opacity-20">No Data</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byPlatform} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="8 8" vertical={false} stroke={gridStyle} />
                  <XAxis dataKey="platform" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'rgba(var(--primary), 0.05)'}}
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 20, fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <Bar dataKey="requests" fill="url(#colorBar)" radius={[10, 10, 0, 0]}>
                     <defs>
                        <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={1}/>
                          <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0.8}/>
                        </linearGradient>
                      </defs>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel title="Platform Performance (ms)">
            {byPlatform.length === 0 ? (
              <div className="h-60 flex items-center justify-center font-black uppercase tracking-[0.2em] opacity-20">No Data</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={byPlatform} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="8 8" vertical={false} stroke={gridStyle} />
                  <XAxis dataKey="platform" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis unit="ms" tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 20, fontSize: 10, fontWeight: 'bold' }} />
                  <Area type="monotone" dataKey="avgLatencyMs" stroke="var(--primary)" fill="url(#colorLatency)" strokeWidth={4} />
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <div className="lg:col-span-2">
            <Panel title="Intelligence Timeline">
              {timeline.length === 0 ? (
                <div className="h-60 flex items-center justify-center font-black uppercase tracking-[0.2em] opacity-20">No Data</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeline} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={gridStyle} vertical={false} />
                    <XAxis dataKey="timestamp" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 20, fontSize: 10, fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }} iconType="circle" />
                    <Line type="step" dataKey="successCount" name="Success" stroke="var(--primary)" strokeWidth={6} dot={{ r: 4, strokeWidth: 2, fill: 'white' }} activeDot={{ r: 8 }} />
                    <Line type="step" dataKey="failureCount" name="Failures" stroke="var(--destructive)" strokeWidth={4} strokeDasharray="10 10" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div className="lg:col-span-2">
            <Panel title="Advanced Per-Model Breakdown">
              {byModel.length === 0 ? (
                <div className="h-40 flex items-center justify-center font-black uppercase tracking-[0.2em] opacity-20">No Data</div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto -mx-8">
                  <Table>
                    <TableHeader className="bg-primary/5">
                      <TableRow className="border-white/10">
                        <TableHead className="pl-8 font-black uppercase text-[10px] tracking-widest text-primary">Model</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest text-primary">Provider</TableHead>
                        <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-primary">Requests</TableHead>
                        <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-primary">Success</TableHead>
                        <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-primary">Latency</TableHead>
                        <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-primary">Tokens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byModel.map((m: any, i: number) => (
                        <TableRow key={i} className="border-white/10 hover:bg-white/30 transition-colors group">
                          <TableCell className="pl-8 text-sm font-black group-hover:text-primary transition-colors">{m.displayName}</TableCell>
                          <TableCell className="text-[10px] font-bold opacity-60 uppercase">{m.platform}</TableCell>
                          <TableCell className="text-right font-black tabular-nums">{m.requests}</TableCell>
                          <TableCell className="text-right font-black tabular-nums">
                             <span className={m.successRate > 90 ? 'text-emerald-500' : 'text-primary'}>{m.successRate}%</span>
                          </TableCell>
                          <TableCell className="text-right font-black tabular-nums text-secondary">{m.avgLatencyMs} ms</TableCell>
                          <TableCell className="text-right font-black tabular-nums pr-8">{formatTokens(m.totalInputTokens + m.totalOutputTokens)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="System Failures Distribution">
            {!errorDist?.byPlatform?.length ? (
              <div className="h-60 flex items-center justify-center font-black uppercase tracking-[0.2em] opacity-20">No Errors</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={errorDist.byPlatform} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="8 8" vertical={false} stroke={gridStyle} />
                  <XAxis dataKey="platform" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 20, fontSize: 10, fontWeight: 'bold' }} />
                  <Bar dataKey="count" fill="var(--destructive)" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel title="Live Incident Feed">
            {errors.length === 0 ? (
              <div className="h-60 flex items-center justify-center font-black uppercase tracking-[0.2em] opacity-20">System Healthy</div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto -mx-8">
                <div className="px-8 space-y-4">
                  {errors.slice(0, 20).map((e: any) => (
                    <div key={e.id} className="p-4 rounded-2xl bg-white/20 border border-destructive/10 flex flex-col gap-1 hover:bg-destructive/5 transition-colors group">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase text-destructive tracking-widest">{e.platform} Incident</span>
                         <span className="text-[10px] font-bold opacity-40">{new Date(e.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs font-bold line-clamp-2 group-hover:line-clamp-none transition-all">{e.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

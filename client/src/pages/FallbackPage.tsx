import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/page-header'

interface FallbackEntry {
  modelDbId: number
  priority: number
  effectivePriority: number
  penalty: number
  rateLimitHits: number
  enabled: boolean
  platform: string
  modelId: string
  displayName: string
  intelligenceRank: number
  speedRank: number
  sizeLabel: string
  rpmLimit: number | null
  rpdLimit: number | null
  monthlyTokenBudget: string
  keyCount: number
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface TokenUsageData {
  totalBudget: number
  totalUsed: number
  models: { displayName: string; platform: string; budget: number }[]
}

const platformColors: Record<string, string> = {
  google:      '#4285f4',
  groq:        '#f55036',
  cerebras:    '#8b5cf6',
  sambanova:   '#14b8a6',
  nvidia:      '#76b900',
  mistral:     '#f59e0b',
  openrouter:  '#ec4899',
  github:      '#6e7b8b',
  cohere:      '#d946ef',
  cloudflare:  '#f38020',
  zhipu:       '#06b6d4',
  ollama:      '#000000',
  kilo:        '#7c3aed',
  pollinations: '#a855f7',
  llm7:        '#0ea5e9',
}

function TokenUsageBar({ data }: { data: TokenUsageData }) {
  const { totalBudget, totalUsed, models } = data
  const remaining = Math.max(0, totalBudget - totalUsed)
  const remainingPct = totalBudget > 0 ? Math.round((remaining / totalBudget) * 100) : 0

  const modelsWithWidth = models.map(m => ({
    ...m,
    remainingTokens: totalBudget > 0 ? (m.budget / totalBudget) * remaining : 0,
    widthPct: totalBudget > 0 ? (m.budget / totalBudget) * (remaining / totalBudget) * 100 : 0,
  }))
  const usedPct = totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0

  return (
    <section className="rounded-[2.5rem] border border-white/40 bg-white/40 dark:bg-black/20 backdrop-blur-3xl p-8 shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 right-0 size-32 bg-primary/10 blur-3xl" />
      <div className="flex items-baseline justify-between mb-6 relative z-10">
        <h2 className="text-sm font-black uppercase tracking-widest text-primary">Monthly Token Health</h2>
        <span className="text-xs font-bold tabular-nums">
          <span className="text-primary">{formatTokens(remaining)}</span> <span className="opacity-50 tracking-tighter">Remaining</span>
          <span className="mx-2 opacity-20">|</span>
          <span className="text-secondary">{remainingPct}% Efficiency</span>
        </span>
      </div>

      <div className="flex h-4 rounded-full overflow-hidden bg-white/40 dark:bg-white/5 border border-white/20 p-0.5 relative z-10 shadow-inner">
        {modelsWithWidth.map((m, i) => (
          <div
            key={i}
            title={`${m.displayName} (${m.platform})`}
            className="rounded-full h-full mx-[1px] transition-all hover:scale-y-125"
            style={{
              width: `${m.widthPct}%`,
              backgroundColor: platformColors[m.platform] ?? 'var(--primary)',
              boxShadow: `0 0 10px ${platformColors[m.platform] ?? 'var(--primary)'}40`
            }}
          />
        ))}
        {totalUsed > 0 && (
          <div
            title={`Used: ${formatTokens(totalUsed)}`}
            className="bg-white/10 dark:bg-white/5 h-full rounded-full"
            style={{ width: `${usedPct}%` }}
          />
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 relative z-10">
        {modelsWithWidth.map((m, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/20 hover:bg-white/60 transition-colors group">
            <span
              className="size-3 rounded-full flex-shrink-0 shadow-lg group-hover:scale-125 transition-transform"
              style={{ backgroundColor: platformColors[m.platform] ?? 'var(--primary)' }}
            />
            <div className="flex flex-col min-w-0">
               <span className="text-[10px] font-black uppercase truncate tracking-tight">{m.displayName}</span>
               <span className="text-[9px] font-bold opacity-40 tabular-nums">{formatTokens(m.remainingTokens)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SortableModelRow({
  entry,
  index,
  onToggle,
}: {
  entry: FallbackEntry
  index: number
  onToggle: (modelDbId: number, enabled: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.modelDbId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-6 px-8 py-5 bg-white/40 dark:bg-black/10 backdrop-blur-md border border-white/20 hover:bg-white/60 dark:hover:bg-white/5 transition-all ${isDragging ? 'z-50 scale-105 shadow-2xl opacity-100 ring-2 ring-primary/50' : ''} ${entry.enabled ? '' : 'opacity-40 grayscale'}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-primary/40 hover:text-primary transition-colors flex-shrink-0"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="15" x2="16" y2="15" />
        </svg>
      </button>
      
      <div className="size-10 rounded-2xl bg-white dark:bg-zinc-900 shadow-lg flex items-center justify-center font-black text-xs text-primary flex-shrink-0 border border-white/40">
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-black text-base tracking-tight text-primary">{entry.displayName}</span>
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{entry.platform}</span>
          {entry.penalty > 0 && (
            <span className="text-[10px] font-black uppercase text-rose-500 animate-pulse">
              Penalty: −{entry.penalty}
            </span>
          )}
        </div>
        <div className="flex gap-4 mt-1 text-[10px] font-bold uppercase tracking-widest opacity-40">
          <span className="flex items-center gap-1.5"><div className="size-1.5 rounded-full bg-secondary" /> Intelligence #{entry.intelligenceRank}</span>
          <span className="flex items-center gap-1.5"><div className="size-1.5 rounded-full bg-emerald-500" /> Speed #{entry.speedRank}</span>
          {entry.rpmLimit && <span>{entry.rpmLimit} RPM</span>}
          <span>{entry.monthlyTokenBudget} Tokens/Month</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
         <span className="text-[9px] font-black uppercase tracking-widest opacity-30">{entry.enabled ? 'Active' : 'Disabled'}</span>
         <Switch
            checked={entry.enabled}
            onCheckedChange={(checked) => onToggle(entry.modelDbId, checked)}
            className="data-[state=checked]:bg-primary"
         />
      </div>
    </div>
  )
}

export default function FallbackPage() {
  const queryClient = useQueryClient()
  const [localEntries, setLocalEntries] = useState<FallbackEntry[] | null>(null)

  const { data: entries = [], isLoading } = useQuery<FallbackEntry[]>({
    queryKey: ['fallback'],
    queryFn: () => apiFetch('/api/fallback'),
  })

  const { data: tokenUsage } = useQuery<TokenUsageData>({
    queryKey: ['fallback', 'token-usage'],
    queryFn: () => apiFetch('/api/fallback/token-usage'),
  })

  const saveMutation = useMutation({
    mutationFn: (data: { modelDbId: number; priority: number; enabled: boolean }[]) =>
      apiFetch('/api/fallback', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      setLocalEntries(null)
    },
  })

  const sortMutation = useMutation({
    mutationFn: (preset: string) =>
      apiFetch(`/api/fallback/sort/${preset}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      setLocalEntries(null)
    },
  })

  const allEntries = localEntries ?? entries
  const displayEntries = allEntries.filter(e => e.keyCount > 0)
  const unconfiguredPlatforms = [...new Set(allEntries.filter(e => e.keyCount === 0).map(e => e.platform))]

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayEntries.findIndex(e => e.modelDbId === active.id)
    const newIndex = displayEntries.findIndex(e => e.modelDbId === over.id)
    const reorderedVisible = arrayMove(displayEntries, oldIndex, newIndex)
    const unconfigured = allEntries.filter(e => e.keyCount === 0)
    const merged = [
      ...reorderedVisible.map((e, i) => ({ ...e, priority: i + 1 })),
      ...unconfigured.map((e, i) => ({ ...e, priority: reorderedVisible.length + i + 1 })),
    ]
    setLocalEntries(merged)
  }

  function handleToggle(modelDbId: number, enabled: boolean) {
    const updated = allEntries.map(e =>
      e.modelDbId === modelDbId ? { ...e, enabled } : e
    )
    setLocalEntries(updated)
  }

  function handleSave() {
    if (!localEntries) return
    saveMutation.mutate(
      allEntries.map(e => ({
        modelDbId: e.modelDbId,
        priority: e.priority,
        enabled: e.enabled,
      }))
    )
  }

  const hasChanges = localEntries !== null

  return (
    <div className="space-y-12 animate-in fade-in duration-1000 max-w-6xl mx-auto pb-20">
      <PageHeader
        title="Intelligence Fallback Chain"
        description="ลากเพื่อจัดลำดับการทำงานของ AI ระบบจะลองไล่จากบนลงล่างจนกว่าจะสำเร็จ"
        actions={
          <div className="flex gap-1.5 bg-white/40 dark:bg-black/20 p-1.5 rounded-full border border-white/40 shadow-xl">
            <Button variant="ghost" size="sm" className="rounded-full px-4 font-black uppercase text-[9px] tracking-widest hover:bg-primary/10 text-primary" onClick={() => sortMutation.mutate('intelligence')} disabled={sortMutation.isPending}>
              Intel High
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full px-4 font-black uppercase text-[9px] tracking-widest hover:bg-emerald-500/10 text-emerald-600" onClick={() => sortMutation.mutate('speed')} disabled={sortMutation.isPending}>
              Speed High
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full px-4 font-black uppercase text-[9px] tracking-widest hover:bg-secondary/10 text-secondary" onClick={() => sortMutation.mutate('budget')} disabled={sortMutation.isPending}>
              Budget High
            </Button>
          </div>
        }
      />

      <div className="space-y-10">
        {tokenUsage && tokenUsage.totalBudget > 0 && (
          <TokenUsageBar data={tokenUsage} />
        )}

        {isLoading ? (
          <div className="h-60 flex items-center justify-center font-black uppercase tracking-widest animate-pulse">Syncing Chain...</div>
        ) : displayEntries.length === 0 ? (
          <div className="rounded-[2.5rem] border-4 border-dashed border-white/40 p-20 text-center bg-white/20">
            <p className="text-lg font-black text-muted-foreground uppercase tracking-widest opacity-40">
              No Models Ready for Routing
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-[2.5rem] border border-white/40 bg-white/20 dark:bg-black/20 backdrop-blur-3xl divide-y divide-white/20 overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)]">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={displayEntries.map(e => e.modelDbId)}
                  strategy={verticalListSortingStrategy}
                >
                  {displayEntries.map((entry, index) => (
                    <SortableModelRow
                      key={entry.modelDbId}
                      entry={entry}
                      index={index}
                      onToggle={handleToggle}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            {hasChanges && (
              <div className="flex justify-center gap-4 pt-4 animate-in slide-in-from-bottom-4">
                <Button variant="ghost" size="lg" className="rounded-full px-8 font-black uppercase tracking-widest text-xs hover:bg-white/20" onClick={() => setLocalEntries(null)}>
                  Cancel Changes
                </Button>
                <Button size="lg" className="rounded-full px-12 font-black uppercase tracking-widest text-xs bg-primary text-white shadow-2xl shadow-primary/30" onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Updating...' : 'Deploy Chain Order'}
                </Button>
              </div>
            )}

            {unconfiguredPlatforms.length > 0 && (
              <div className="flex items-center justify-center gap-4 opacity-30 mt-10">
                 <div className="h-px w-20 bg-primary/50" />
                 <p className="text-[9px] font-black uppercase tracking-[0.4em]">
                   Inactive Platforms: {unconfiguredPlatforms.join(' · ')}
                 </p>
                 <div className="h-px w-20 bg-primary/50" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

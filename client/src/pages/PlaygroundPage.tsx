import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, Send, Mic, Paperclip, Copy, Trash2, 
  ChevronRight, ChevronLeft, Download, Maximize2, 
  Terminal, Activity, Zap, Cpu, History, Search
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface FallbackEntry {
  modelDbId: number
  platform: string
  modelId: string
  displayName: string
  keyCount: number
  enabled: boolean
}

interface Attachment {
  type: 'image' | 'file'
  name: string
  mimeType: string
  data: string // base64
}

interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string | any[]
  meta?: {
    platform?: string
    model?: string
    latency?: number
    usage?: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }
  }
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

const PERSONA_PRESETS = [
  { id: 'general', name: 'AI ผู้ช่วยทั่วไป', prompt: 'คุณคือ AI ผู้ช่วยอัจฉริยะ ของสำนักงานสาธารณสุขจังหวัดมุกดาหาร ตอบคำถามด้วยความสุภาพ ถูกต้อง และกระชับ', icon: <Sparkles className="size-4" /> },
  { id: 'epi', name: 'ระบาดวิทยา', prompt: 'คุณคือผู้เชี่ยวชาญด้านระบาดวิทยาและสถิติสาธารณสุข ช่วยวิเคราะห์ข้อมูลแนวโน้มโรคและให้คำแนะนำตามหลักวิชาการอย่างละเอียด', icon: <Activity className="size-4" /> },
  { id: 'legal', name: 'งานสารบรรณ', prompt: 'คุณคือผู้เชี่ยวชาญด้านระเบียบงานสารบรรณและการร่างหนังสือราชการ ช่วยร่างข้อความหรือบันทึกข้อความให้ถูกต้องตามระเบียบสำนักนายกรัฐมนตรี', icon: <Terminal className="size-4" /> },
  { id: 'med', name: 'ทีมแพทย์', prompt: 'คุณคือ AI ที่ปรึกษาด้านการแพทย์และสาธารณสุข ให้ข้อมูลเกี่ยวกับโรค ยา และแนวทางการรักษาเบื้องต้นตามหลักการแพทย์ที่ทันสมัย', icon: <Zap className="size-4" /> },
]

export default function PlaygroundPage() {
  // --- Core State ---
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('chat_sessions')
    return saved ? JSON.parse(saved) : [{ id: 'default', title: 'การสนทนาใหม่', messages: [], createdAt: Date.now() }]
  })
  const [currentSessionId, setCurrentSessionId] = useState('default')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('auto')
  const [systemPrompt, setSystemPrompt] = useState(PERSONA_PRESETS[0].prompt)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [workspaceContent, setWorkspaceContent] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [searchQuery, setSearchQuery] = useState('')
  
  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0]
  const messages = currentSession.messages
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Queries ---
  const { data: keyData } = useQuery<{ apiKey: string }>({
    queryKey: ['public-key'],
    queryFn: () => apiFetch('/api/public/api-key'),
  })

  const { data: fallbackEntries = [] } = useQuery<FallbackEntry[]>({
    queryKey: ['public-models'],
    queryFn: () => apiFetch('/api/public/models'),
  })

  const availableModels = fallbackEntries.filter(e => e.keyCount > 0 && e.enabled)

  // --- Persistence & Lifecycle ---
  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // --- Handlers ---
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'การสนทนาใหม่',
      messages: [],
      createdAt: Date.now()
    }
    setSessions(prev => [newSession, ...prev])
    setCurrentSessionId(newSession.id)
  }

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      return filtered.length === 0 ? [{ id: 'default', title: 'การสนทนาใหม่', messages: [], createdAt: Date.now() }] : filtered
    })
    if (currentSessionId === id) setCurrentSessionId('default')
  }

  const updateCurrentSession = (updatedMessages: ChatMessage[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        let title = s.title
        if (s.title === 'การสนทนาใหม่' && updatedMessages.length > 0) {
          const userText = updatedMessages.find(m => m.role === 'user')?.content
          if (typeof userText === 'string') title = userText.slice(0, 30) + (userText.length > 30 ? '...' : '')
        }
        return { ...s, messages: updatedMessages, title }
      }
      return s
    }))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        setAttachments(prev => [...prev, { 
          type: file.type.startsWith('image/') ? 'image' : 'file', 
          name: file.name, 
          mimeType: file.type, 
          data: base64 
        }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'th-TH'
    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => setIsRecording(false)
    recognition.onresult = (event: any) => {
      setInput(prev => (prev ? prev + ' ' : '') + event.results[0][0].transcript)
    }
    recognition.start()
  }

  const handleSend = async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || loading) return

    let content: any = text
    if (attachments.length > 0) {
      content = []
      if (text) content.push({ type: 'text', text })
      for (const att of attachments) {
        if (att.type === 'image') content.push({ type: 'image_url', image_url: { url: att.data } })
        else content.push({ type: 'file', file: { name: att.name, mimeType: att.mimeType, data: att.data } })
      }
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content }
    const updatedMessages = [...messages, userMsg]
    updateCurrentSession(updatedMessages)
    setInput('')
    setAttachments([])
    setLoading(true)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (keyData?.apiKey) headers['Authorization'] = `Bearer ${keyData.apiKey}`

      const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [{ role: 'system', content: systemPrompt }, ...updatedMessages.map(m => ({ role: m.role, content: m.content }))],
          temperature,
          model: selectedModel !== 'auto' ? selectedModel : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'AI Core Error')

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.choices?.[0]?.message?.content || '',
        meta: { 
          platform: data._routed_via?.platform, 
          model: data._routed_via?.model, 
          latency: data.usage?.latency_ms, 
          usage: data.usage 
        }
      }
      updateCurrentSession([...updatedMessages, assistantMsg])
      
      if (assistantMsg.content.toString().length > 400) {
        setWorkspaceContent(assistantMsg.content.toString())
        setShowWorkspace(true)
      }
    } catch (err: any) {
      updateCurrentSession([...updatedMessages, { id: Date.now().toString(), role: 'assistant', content: `⚠️ FAULT: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const exportChat = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}]\n${typeof m.content === 'string' ? m.content : 'File/Image'}\n`).join('\n---\n\n')
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PHO-AI-${Date.now()}.md`
    a.click()
  }

  const activeModelLabel = selectedModel === 'auto' ? 'Dynamic' : selectedModel
  const totalTokens = messages.reduce((sum, m) => sum + (m.meta?.usage?.total_tokens || 0), 0)
  const avgLatency = messages.filter(m => m.role === 'assistant').length > 0 
    ? Math.round(messages.reduce((sum, m) => sum + (m.meta?.latency || 0), 0) / messages.filter(m => m.role === 'assistant').length) 
    : 0

  return (
    <div className="flex h-[calc(100vh-10rem)] max-w-[1600px] mx-auto w-full group/main gap-4 relative">
      
      {/* SIDEBAR */}
      <motion.aside initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-64 flex flex-col gap-3 shrink-0">
        <Button onClick={createNewSession} className="w-full h-11 rounded-xl bg-primary hover:brightness-110 text-white font-black shadow-lg border-b-4 border-black/20 text-[10px] uppercase">
           <History className="size-3 mr-2" /> New intelligence
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <input 
            type="text" placeholder="Search sessions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 bg-white/20 border-2 border-white/20 rounded-xl pl-9 pr-4 text-[10px] font-bold focus:outline-none focus:border-primary/40"
          />
        </div>
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
          {sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase())).map(s => (
            <div key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`group/session p-3 rounded-xl cursor-pointer border-2 transition-all ${currentSessionId === s.id ? 'bg-white/90 border-primary shadow-md' : 'bg-white/40 border-white/40 hover:bg-white/60'}`}>
              <div className="flex flex-col min-w-0 relative pr-4">
                <span className={`text-[10px] font-black truncate ${currentSessionId === s.id ? 'text-primary' : 'text-muted-foreground'}`}>{s.title}</span>
                <span className="text-[7px] opacity-40 font-black uppercase mt-1">{new Date(s.createdAt).toLocaleDateString()}</span>
                <button onClick={(e) => deleteSession(s.id, e)} className="absolute top-0 right-0 size-5 rounded-full flex items-center justify-center opacity-0 group-hover/session:opacity-100 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" /></button>
              </div>
            </div>
          ))}
        </div>
      </motion.aside>

      {/* CHAT AREA */}
      <div className={`flex-1 flex flex-col rounded-[2.5rem] border-4 border-white bg-white/5 dark:bg-black/40 backdrop-blur-[100px] overflow-hidden min-h-0 shadow-2xl relative transition-all duration-700 ${showWorkspace ? 'flex-[0.6]' : ''}`}>
        <div className="animate-scan" />
        <header className="h-12 shrink-0 bg-white/40 border-b border-white/40 flex items-center justify-between px-6 backdrop-blur-3xl relative z-20">
           <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-[8px] h-5 px-2 bg-white/40 font-black uppercase tracking-widest">{activeModelLabel}</Badge>
           </div>
           <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowWorkspace(!showWorkspace)} className="h-7 rounded-lg text-[8px] font-black uppercase bg-white/40 px-3">{showWorkspace ? <ChevronRight className="size-3" /> : <Maximize2 className="size-3" />}</Button>
              <Button variant="ghost" size="sm" onClick={exportChat} className="h-7 rounded-lg text-[8px] font-black uppercase bg-white/40 px-3"><Download className="size-3" /></Button>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center animate-in fade-in duration-1000 space-y-8">
              <div className="relative size-20 mx-auto">
                 <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-aura-supreme" />
                 <div className="relative size-20 bg-white rounded-2xl flex items-center justify-center shadow-xl border-2 border-primary/10"><Cpu className="size-10 text-primary animate-pulse" /></div>
              </div>
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent bg-[length:200%_auto] animate-plasma-vivid uppercase leading-none">Intelligence Hub</h2>
              <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                 {PERSONA_PRESETS.map(p => (
                   <button key={p.id} onClick={() => { setSystemPrompt(p.prompt); createNewSession(); }} className="flex items-center gap-3 p-3 rounded-2xl bg-white/40 hover:bg-white border border-white/60 shadow-lg transition-all hover:scale-[1.03] text-left group">
                      <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">{p.icon}</div>
                      <div className="flex flex-col"><span className="text-[10px] font-black text-primary uppercase leading-tight">{p.name}</span><span className="text-[7px] text-muted-foreground font-bold mt-0.5 uppercase tracking-tighter">Initialize Module</span></div>
                   </button>
                 ))}
              </div>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg`}>
                  <div className={`relative flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[90%]`}>
                    <div className={`rounded-3xl px-5 py-3 text-[13px] leading-relaxed shadow-xl border backdrop-blur-2xl transition-all ${msg.role === 'user' ? 'bg-gradient-to-br from-primary via-primary to-secondary text-white border-white/20 rounded-tr-none' : 'bg-white/95 dark:bg-zinc-950/95 text-foreground border-white dark:border-zinc-800 rounded-tl-none shadow-black/5 ai-bubble'}`}>
                      <div className="prose prose-sm prose-emerald dark:prose-invert max-w-none">
                         <ReactMarkdown remarkPlugins={[remarkGfm]}>{typeof msg.content === 'string' ? msg.content : 'Multi-modal context attached.'}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 px-3 transition-all opacity-0 group-hover/msg:opacity-100">
                      {msg.meta && <span className="text-[7px] font-black uppercase text-primary/40 tracking-widest">{msg.meta.model} · {msg.meta.latency}ms</span>}
                      <button onClick={() => navigator.clipboard.writeText(String(msg.content))} className="text-[9px] font-black text-primary/40 hover:text-primary uppercase flex items-center gap-1"><Copy className="size-2.5" /> Copy</button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border border-white rounded-2xl px-5 py-3 shadow-lg flex gap-1.5 items-center">
                <div className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="size-1.5 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '200ms' }} />
                <div className="size-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '400ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="p-5 bg-white/60 dark:bg-black/90 backdrop-blur-[120px] border-t border-white/40 relative z-20">
          <div className="flex gap-3 items-end max-w-5xl mx-auto relative">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
            <div className="flex gap-2 shrink-0 mb-1">
              <Button variant="ghost" size="icon" className="size-10 rounded-xl bg-white/90 border border-white shadow-xl transition-all active:scale-90" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4 text-primary" /></Button>
              <Button variant="ghost" size="icon" className={`size-10 rounded-xl border border-white shadow-xl transition-all active:scale-90 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white/90'}`} onClick={handleVoiceInput}><Mic className="size-4 text-primary" /></Button>
            </div>
            <textarea 
              ref={inputRef} value={input} onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} 
              placeholder="Query intelligence matrix..." rows={1} 
              className="relative w-full resize-none rounded-2xl border-2 border-white bg-white/95 dark:bg-zinc-950/95 px-5 py-3 text-[14px] font-bold focus:outline-none focus:border-primary shadow-xl min-h-[44px] max-h-[200px]" 
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()} className="size-10 rounded-xl bg-primary text-white shadow-lg shrink-0 transition-transform active:scale-90"><Send className="size-4" /></Button>
          </div>
        </div>
      </div>

      {/* WORKSPACE PANEL */}
      <AnimatePresence>
        {showWorkspace && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 450, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex flex-col gap-4 shrink-0 overflow-hidden">
             <div className="flex-1 rounded-[2.5rem] bg-white/10 dark:bg-black/40 backdrop-blur-[100px] border-4 border-white p-6 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-2">
                      <Terminal className="size-4 text-secondary" />
                      <span className="text-[10px] font-black uppercase text-secondary tracking-widest">Workspace Matrix</span>
                   </div>
                   <Button variant="ghost" size="sm" onClick={() => { const blob = new Blob([workspaceContent], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'PHO-Document.txt'; a.click(); }} className="h-6 text-[8px] bg-secondary/10 text-secondary uppercase font-black px-2">Download</Button>
                </div>
                <Separator className="bg-secondary/20 mb-4" />
                <textarea value={workspaceContent} onChange={(e) => setWorkspaceContent(e.target.value)} className="flex-1 w-full bg-transparent text-[12px] font-bold text-foreground focus:outline-none resize-none leading-relaxed custom-scrollbar" placeholder="Long drafts will appear here..." />
             </div>
             
             <div className="p-5 rounded-[2rem] bg-white/10 backdrop-blur-3xl border-2 border-secondary/20 shadow-xl space-y-4">
                <div className="flex justify-between items-end">
                   <div className="flex flex-col"><span className="text-[16px] font-black text-secondary leading-none">{totalTokens.toLocaleString()}</span><span className="text-[8px] font-bold opacity-40 uppercase mt-1 tracking-widest">Total Tokens</span></div>
                   <div className="flex flex-col items-end"><span className="text-[16px] font-black text-emerald-500 leading-none">{avgLatency} ms</span><span className="text-[8px] font-bold opacity-40 uppercase mt-1 tracking-widest">Latency</span></div>
                </div>
                <div className="space-y-2">
                   <div className="flex justify-between text-[8px] font-black uppercase text-primary"><span>Core Tuning</span><span>{temperature}</span></div>
                   <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-1 bg-primary/20 rounded-full appearance-none cursor-pointer accent-primary" />
                </div>
                <div className="space-y-2">
                   <Label className="text-[9px] font-black uppercase text-primary tracking-widest">Model Override</Label>
                   <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? 'auto')}>
                      <SelectTrigger className="w-full h-9 rounded-xl bg-white/40 border-white/20 text-[10px] font-black px-3"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-2xl border-white/40 backdrop-blur-3xl bg-white/95 dark:bg-zinc-950/95">
                         <SelectItem value="auto" className="font-bold text-[11px]">Dynamic Engine</SelectItem>
                         {availableModels.map(m => <SelectItem key={m.modelDbId} value={m.modelId} className="font-bold text-[11px] uppercase">{m.displayName}</SelectItem>)}
                      </SelectContent>
                   </Select>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* FLOAT TOGGLE */}
      {!showWorkspace && (
        <button onClick={() => setShowWorkspace(true)} className="fixed right-6 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/80 dark:bg-black/80 border-2 border-primary/20 flex items-center justify-center shadow-2xl hover:scale-110 transition-all z-50">
           <ChevronLeft className="size-4 text-primary" />
        </button>
      )}
    </div>
  )
}

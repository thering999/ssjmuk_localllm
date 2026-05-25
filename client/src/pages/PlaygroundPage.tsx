import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, Send, Mic, Paperclip, Trash2, 
  ChevronRight, ChevronLeft, Download,
  Terminal, Activity, Zap, Cpu, History, Search,
  BarChart3, FileText, Copy, Pin, PinOff,
  Settings2, Eye, Brain, Database, ShieldAlert
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
  pinned?: boolean
  timestamp: number
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
  { id: 'general', name: 'AI ผู้ช่วยทั่วไป', prompt: 'คุณคือ AI ผู้ช่วยอัจฉริยะ ของสำนักงานสาธารณสุขจังหวัดมุกดาหาร ตอบคำถามด้วยความสุภาพ ถูกต้อง และกระชับ', icon: <Sparkles className="size-3" />, theme: 'emerald' },
  { id: 'epi', name: 'ระบาดวิทยา', prompt: 'คุณคือผู้เชี่ยวชาญด้านระบาดวิทยาและสถิติสาธารณสุข ช่วยวิเคราะห์ข้อมูลแนวโน้มโรคและให้คำแนะนำตามหลักวิชาการอย่างละเอียด', icon: <Activity className="size-3" />, theme: 'sapphire' },
  { id: 'legal', name: 'งานสารบรรณ', prompt: 'คุณคือผู้เชี่ยวชาญด้านระเบียบงานสารบรรณและการร่างหนังสือราชการ ช่วยร่างข้อความหรือบันทึกข้อความให้ถูกต้องตามระเบียบสำนักนายกรัฐมนตรี', icon: <Terminal className="size-3" />, theme: 'amber' },
  { id: 'med', name: 'ทีมแพทย์', prompt: 'คุณคือ AI ที่ปรึกษาด้านการแพทย์และสาธารณสุข ให้ข้อมูลเกี่ยวกับโรค ยา และแนวทางการรักษาเบื้องต้นตามหลักการแพทย์ที่ทันสมัย', icon: <Zap className="size-3" />, theme: 'ruby' },
]

const THEMES = {
  emerald: 'from-emerald-500 via-emerald-600 to-teal-700',
  sapphire: 'from-blue-500 via-blue-600 to-indigo-700',
  ruby: 'from-rose-500 via-red-600 to-crimson-700',
  amber: 'from-amber-500 via-orange-600 to-amber-700',
}

export default function PlaygroundPage() {
  // --- Core State ---
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('chat_sessions')
    return saved ? JSON.parse(saved) : [{ id: 'default', title: 'Intelligence Initialized', messages: [], createdAt: Date.now() }]
  })
  const [currentSessionId, setCurrentSessionId] = useState('default')
  const [activeTheme, setActiveTheme] = useState<keyof typeof THEMES>('emerald')
  const [searchQuery, setSearchQuery] = useState('')
  const [msgSearch, setMsgSearch] = useState('')
  
  // --- UI Layout State ---
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('auto')
  const [systemPrompt, setSystemPrompt] = useState(PERSONA_PRESETS[0].prompt)
  const [rightPanel, setRightPanel] = useState<'none' | 'vitals' | 'workspace'>('vitals')
  const [workspaceContent, setWorkspaceContent] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0]
  const messages = currentSession.messages
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Derived State ---
  const filteredMessages = useMemo(() => {
    if (!msgSearch) return messages
    return messages.filter(m => 
      typeof m.content === 'string' && m.content.toLowerCase().includes(msgSearch.toLowerCase())
    )
  }, [messages, msgSearch])

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

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    if (!msgSearch) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, msgSearch, rightPanel])

  // --- Handlers ---
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'Intelligence Initialized',
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
      return filtered.length === 0 ? [{ id: 'default', title: 'Intelligence Initialized', messages: [], createdAt: Date.now() }] : filtered
    })
    if (currentSessionId === id) setCurrentSessionId('default')
  }

  const togglePin = (msgId: string) => {
    updateCurrentSession(messages.map(m => m.id === msgId ? { ...m, pinned: !m.pinned } : m))
  }

  const deleteMessage = (id: string) => {
    updateCurrentSession(messages.filter(m => m.id !== id))
  }

  const updateCurrentSession = (updatedMessages: ChatMessage[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        let title = s.title
        if ((s.title === 'Intelligence Initialized' || s.title === 'Neural Link Start' || s.title === 'การสนทนาใหม่') && updatedMessages.length > 0) {
          const firstMsg = updatedMessages.find(m => m.role === 'user')?.content
          if (typeof firstMsg === 'string') title = firstMsg.slice(0, 30) + (firstMsg.length > 30 ? '...' : '')
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

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content, timestamp: Date.now() }
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
      if (!res.ok) throw new Error(data.error?.message || 'AI Core Fault')

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.choices?.[0]?.message?.content || '',
        timestamp: Date.now(),
        meta: { platform: data._routed_via?.platform, model: data._routed_via?.model, latency: data.usage?.latency_ms, usage: data.usage }
      }
      updateCurrentSession([...updatedMessages, assistantMsg])
      
      if (assistantMsg.content.toString().length > 400) {
        setWorkspaceContent(assistantMsg.content.toString())
        setRightPanel('workspace')
      }
    } catch (err: any) {
      updateCurrentSession([...updatedMessages, { id: Date.now().toString(), role: 'assistant', content: `⚠️ FAULT: ${err.message}`, timestamp: Date.now() }])
    } finally {
      setLoading(false)
    }
  }

  const exportChat = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}]\n${typeof m.content === 'string' ? m.content : 'Binary Linked'}\n`).join('\n---\n\n')
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Neural-Export-${Date.now()}.md`
    a.click()
  }

  const quickAction = (prompt: string) => {
    setInput(prompt)
    setTimeout(() => handleSend(), 0)
  }

  const totalTokens = messages.reduce((sum, m) => sum + (m.meta?.usage?.total_tokens || 0), 0)
  const activeModelLabel = selectedModel === 'auto' ? 'Dynamic' : selectedModel

  return (
    <div className={`flex h-[calc(100vh-10rem)] max-w-[1750px] mx-auto w-full group/main gap-3 relative animate-in fade-in duration-500 theme-${activeTheme}`}>
      
      {/* SIDEBAR: COLLAPSIBLE DENSITY */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex flex-col gap-3 shrink-0 overflow-hidden border-r border-white/5 pr-2">
            <Button onClick={createNewSession} className={`w-full h-10 rounded-xl bg-gradient-to-r ${THEMES[activeTheme]} text-white font-black shadow-lg active:scale-95 transition-all text-[11px] uppercase tracking-wider`}>
              <Sparkles className="size-3.5 mr-2" /> New Neural Core
            </Button>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground opacity-40" />
              <input 
                type="text" placeholder="Protocol filter..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 text-[11px] font-bold focus:border-primary/40 outline-none transition-all placeholder:text-[10px]"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5">
               {sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase())).map(s => (
                 <div key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`group/session p-2.5 rounded-xl cursor-pointer border transition-all ${currentSessionId === s.id ? 'bg-white/10 border-primary shadow-inner ring-1 ring-primary/20' : 'bg-transparent border-transparent hover:bg-white/5'}`}>
                    <div className="flex items-center gap-3">
                       <div className={`size-1.5 rounded-full ${currentSessionId === s.id ? 'bg-primary animate-pulse' : 'bg-white/20'}`} />
                       <span className={`text-[11px] font-bold truncate flex-1 ${currentSessionId === s.id ? 'text-white' : 'text-muted-foreground'}`}>{s.title}</span>
                       <button onClick={(e) => deleteSession(s.id, e)} className="opacity-0 group-hover/session:opacity-100 hover:text-destructive transition-all"><Trash2 className="size-3.5" /></button>
                    </div>
                 </div>
               ))}
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
               <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Aura Spectrum</span>
                  <Palette className="size-3 opacity-30" />
               </div>
               <div className="flex justify-between gap-1">
                  {Object.keys(THEMES).map(t => (
                    <button key={t} onClick={() => setActiveTheme(t as any)} className={`size-6 rounded-lg border-2 transition-all ${activeTheme === t ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-30'} bg-gradient-to-br ${THEMES[t as keyof typeof THEMES]}`} />
                  ))}
               </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* CENTER: INTELLIGENCE HUB */}
      <div className={`flex-1 flex flex-col rounded-[2.5rem] border-2 border-white/20 bg-black/20 backdrop-blur-[100px] overflow-hidden min-h-0 shadow-3xl relative transition-all duration-500`}>
        <div className="animate-scan opacity-10" />
        
        {/* COMPACT NEXUS HEADER */}
        <header className="h-12 shrink-0 bg-white/5 border-b border-white/10 flex items-center justify-between px-6 backdrop-blur-3xl relative z-20">
           <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="size-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-all text-muted-foreground"><History className="size-4.5" /></button>
              <Separator orientation="vertical" className="h-4 bg-white/10" />
              <div className="flex items-center gap-3">
                 <Badge variant="outline" className="text-[8px] h-5 px-2 bg-primary/10 border-primary/30 text-primary font-black uppercase tracking-widest animate-pulse">Neural Active</Badge>
                 <span className="text-[10px] font-black text-white/40 uppercase tracking-tighter truncate max-w-[200px]">{currentSession.title}</span>
              </div>
           </div>
           
           <div className="flex items-center gap-2">
              <div className="relative group/search">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground opacity-20" />
                <input 
                  type="text" placeholder="Search protocol..." value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)}
                  className="w-32 h-7 bg-white/5 border border-white/10 rounded-lg pl-8 pr-2 text-[9px] font-bold focus:w-48 outline-none transition-all placeholder:text-[8px]"
                />
              </div>
              <div className="flex bg-white/5 rounded-lg border border-white/10 p-0.5">
                 <button onClick={() => setRightPanel('vitals')} className={`h-6 px-3 rounded-md text-[8px] font-black uppercase transition-all ${rightPanel === 'vitals' ? 'bg-primary text-white shadow-lg' : 'hover:bg-white/5 text-muted-foreground'}`}>Vitals</button>
                 <button onClick={() => setRightPanel('workspace')} className={`h-6 px-3 rounded-md text-[8px] font-black uppercase transition-all ${rightPanel === 'workspace' ? 'bg-secondary text-white shadow-lg' : 'hover:bg-white/5 text-muted-foreground'}`}>Workspace</button>
                 <button onClick={() => setRightPanel('none')} className="size-6 flex items-center justify-center hover:bg-white/5 text-muted-foreground rounded-md transition-all"><ChevronRight className="size-3" /></button>
              </div>
              <Button variant="ghost" size="sm" onClick={exportChat} className="h-7 rounded-lg text-[9px] font-black uppercase bg-white/10 border border-white/10 hover:bg-white/20 transition-all"><Download className="size-3.5" /></Button>
           </div>
        </header>

        {/* MESSAGES: HIGH DENSITY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar relative z-10 scroll-smooth">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-10">
              <div className="space-y-4">
                 <motion.div animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="relative size-20 mx-auto">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse" />
                    <Brain className="size-20 text-primary opacity-30" />
                 </motion.div>
                 <h2 className={`text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r ${THEMES[activeTheme]} animate-plasma-vivid uppercase tracking-[0.2em] leading-none`}>Neural Nexus v6.0</h2>
                 <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.6em]">System Intelligence Hub · SSJ MUKDAHAN</p>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                 {PERSONA_PRESETS.map(p => (
                   <button key={p.id} onClick={() => { setSystemPrompt(p.prompt); setActiveTheme(p.theme as any); createNewSession(); }} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 shadow-lg transition-all text-left group">
                      <div className="size-9 rounded-xl bg-white/5 flex items-center justify-center text-primary border border-white/10 group-hover:scale-110 transition-transform">{p.icon}</div>
                      <div className="flex flex-col"><span className="text-[11px] font-black text-white uppercase leading-none">{p.name}</span><span className="text-[8px] text-muted-foreground font-bold mt-1 uppercase">Initialize Module</span></div>
                   </button>
                 ))}
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                 {['สรุปเนื้อหา', 'ร่างร่างเอกสาร', 'วิเคราะห์สถิติ', 'ตรวจสอบกฎหมาย'].map((txt, i) => (
                   <Button key={i} variant="ghost" onClick={() => quickAction(txt)} className="h-8 rounded-full bg-white/5 hover:bg-primary hover:text-white border border-white/10 text-[9px] font-black uppercase px-4 transition-all">{txt}</Button>
                 ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filteredMessages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg relative`}>
                  <div className={`relative flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div className={`rounded-2xl px-5 py-3 text-[13.5px] leading-relaxed shadow-xl border backdrop-blur-3xl transition-all ${msg.role === 'user' ? `bg-gradient-to-br ${THEMES[activeTheme]} text-white border-white/10 rounded-tr-none shadow-primary/20` : 'bg-white/95 dark:bg-zinc-900/95 text-foreground border-white dark:border-zinc-800 rounded-tl-none ai-bubble'}`}>
                       <div className="markdown-content font-medium tracking-tight prose prose-sm prose-emerald dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{typeof msg.content === 'string' ? msg.content : 'Complex data matrix link established.'}</ReactMarkdown>
                       </div>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 px-3 transition-all opacity-0 group-hover/msg:opacity-100">
                       <span className="text-[8px] font-black text-white/20 uppercase tracking-tighter">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                       <button onClick={() => togglePin(msg.id)} className={`transition-all ${msg.pinned ? 'text-amber-500 scale-125' : 'text-white/20 hover:text-white'}`}>{msg.pinned ? <Pin className="size-3" /> : <PinOff className="size-3" />}</button>
                       <button onClick={() => navigator.clipboard.writeText(typeof msg.content === 'string' ? msg.content : '')} className="text-[9px] font-black text-primary/40 hover:text-primary uppercase flex items-center gap-1"><Copy className="size-2.5" /> Copy</button>
                       <button onClick={() => deleteMessage(msg.id)} className="text-[9px] font-black text-destructive/40 hover:text-destructive uppercase flex items-center gap-1"><Trash2 className="size-2.5" /> Del</button>
                       {msg.meta && <span className="text-[8px] font-black text-primary/20 uppercase">{msg.meta.latency}ms · {msg.meta.usage?.total_tokens}T</span>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3">
                 <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => <div key={i} className="size-1 rounded-full bg-primary animate-bounce shadow-[0_0_8px_var(--primary)]" style={{ animationDelay: `${i * 150}ms` }} />)}
                 </div>
                 <span className="text-[10px] font-black uppercase text-primary tracking-widest leading-none">Neural Link Synced</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT: ULTRA COMPACT */}
        <div className="p-4 bg-white/5 border-t border-white/10 relative z-20 backdrop-blur-3xl">
          <div className="flex gap-3 mb-4 flex-wrap">
             {attachments.map((att, idx) => (
                <div key={idx} className="relative group/att animate-in zoom-in-75 duration-300">
                  {att.type === 'image' ? <img src={att.data} className="size-14 object-cover rounded-xl border border-white/20 shadow-lg" alt="" /> : <div className="size-14 flex flex-col items-center justify-center bg-white/5 rounded-xl border border-white/20 shadow-lg text-[7px] font-black p-2 text-center"><FileText className="size-5 text-primary mb-1" /><span className="truncate w-full uppercase">{att.name}</span></div>}
                  <button onClick={() => removeAttachment(idx)} className="absolute -top-1.5 -right-1.5 size-5 bg-destructive text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 z-20"><Trash2 className="size-3" /></button>
                </div>
             ))}
          </div>
          <div className="flex gap-3 items-end max-w-5xl mx-auto relative group/input-nexus">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
            <div className="flex gap-1.5 shrink-0 mb-1">
              <Button variant="ghost" size="icon" className="size-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all active:scale-90 shadow-inner" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4.5" /></Button>
              <Button variant="ghost" size="icon" className={`size-9 rounded-xl border transition-all active:scale-90 ${isRecording ? 'bg-red-600/20 border-red-500 text-red-500 animate-pulse' : 'bg-white/5 border-white/10 hover:bg-white/10'}`} onClick={handleVoiceInput}><Mic className="size-4.5" /></Button>
            </div>
            <div className="flex-1 relative">
              <textarea 
                ref={inputRef} value={input} onChange={e => setInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} 
                placeholder="Submit query to neural link..." rows={1} 
                className="relative w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[14px] font-medium focus:border-primary focus:bg-white/10 outline-none transition-all min-h-[42px] max-h-[180px] custom-scrollbar placeholder:text-[12px] placeholder:opacity-20" 
                style={{ height: 'auto', overflow: 'hidden' }} onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 180) + 'px'; }} 
              />
            </div>
            <Button onClick={handleSend} disabled={loading || !input.trim()} className={`h-10 px-6 rounded-xl bg-gradient-to-br ${THEMES[activeTheme]} hover:brightness-110 active:scale-95 shadow-lg font-black text-white shrink-0 transition-all border-b-2 border-black/20`}>
              {loading ? <span className="size-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send className="size-4.5" />}
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-6 opacity-20 group-hover/main:opacity-40 transition-all duration-1000">
             <div className="h-px flex-1 bg-white/10" />
             <p className="text-[7px] font-black uppercase tracking-[0.5em] text-white whitespace-nowrap">Neural Matrix v6.0 · Ultra High-Density Core</p>
             <div className="h-px flex-1 bg-white/10" />
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: DUAL PURPOSE */}
      <AnimatePresence>
        {rightPanel !== 'none' && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 450, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex flex-col gap-3 shrink-0 overflow-hidden">
             
             {/* VITALS VIEW */}
             {rightPanel === 'vitals' && (
               <div className="flex flex-col gap-3 h-full">
                  <div className="p-5 rounded-[2rem] bg-white/5 border border-white/10 space-y-6 shadow-2xl">
                     <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Matrix Energy</span>
                           <span className="text-xl font-black text-secondary leading-none tabular-nums">{totalTokens.toLocaleString()} <span className="text-[9px] opacity-30 uppercase">T</span></span>
                        </div>
                        <Badge variant="outline" className="h-9 px-4 rounded-xl border-emerald-500/20 bg-emerald-500/5 text-emerald-400 flex flex-col items-center justify-center">
                           <span className="text-[11px] font-black tabular-nums">฿{(totalTokens * 0.000035).toFixed(4)}</span>
                           <span className="text-[7px] font-bold uppercase leading-none mt-1">Savings</span>
                        </Badge>
                     </div>
                     <div className="space-y-4 pt-4 border-t border-white/5">
                        <div className="space-y-2">
                           <div className="flex justify-between text-[9px] font-black uppercase text-primary/60 tracking-widest"><span>Intelligence Core Tuning</span><span className="text-primary">{temperature}</span></div>
                           <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary" />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[9px] font-black uppercase text-primary/60 block mb-2 tracking-widest">Core Engine Engine</Label>
                           <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? 'auto')}>
                              <SelectTrigger className="w-full h-9 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-tighter px-4 shadow-inner transition-all hover:bg-white/10"><SelectValue /></SelectTrigger>
                              <SelectContent className="rounded-2xl border-white/10 backdrop-blur-3xl bg-zinc-950 shadow-3xl">
                                 <SelectItem value="auto" className="font-black text-[10px] uppercase p-3">Dynamic Route</SelectItem>
                                 <Separator className="my-1 opacity-5" />
                                 {availableModels.map(m => <SelectItem key={m.modelDbId} value={m.modelId} className="font-black text-[10px] uppercase tracking-tighter p-3">{m.displayName}</SelectItem>)}
                              </SelectContent>
                           </Select>
                        </div>
                     </div>
                  </div>

                  <div className="flex-1 rounded-[2rem] bg-white/5 border border-white/10 p-5 shadow-3xl flex flex-col gap-4">
                     <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20"><Database className="size-4" /></div>
                        <span className="text-[10px] font-black uppercase text-white/60 tracking-widest leading-none">System Identity</span>
                     </div>
                     <textarea 
                        value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                        className="flex-1 w-full bg-transparent text-[12px] font-medium text-foreground focus:outline-none resize-none leading-relaxed custom-scrollbar placeholder:opacity-5 border border-white/5 rounded-xl p-3"
                        placeholder="Define system persona..."
                     />
                     <div className="flex items-center gap-2 text-amber-500/60 text-[8px] font-black uppercase bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                        <ShieldAlert className="size-3" />
                        <span>Manual override active. Use with caution.</span>
                     </div>
                  </div>
               </div>
             )}

             {/* WORKSPACE VIEW */}
             {rightPanel === 'workspace' && (
               <div className="flex-1 rounded-[2.5rem] bg-white/5 dark:bg-black/40 backdrop-blur-[100px] border border-white/10 p-6 shadow-3xl relative flex flex-col h-full animate-in zoom-in-95 duration-300">
                  <header className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary border border-secondary/20 shadow-inner"><FileText className="size-4" /></div>
                        <span className="text-[10px] font-black uppercase text-white/60 tracking-widest leading-none">Drafting Unit</span>
                     </div>
                     <Button variant="ghost" size="sm" onClick={() => { const blob = new Blob([workspaceContent], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Analysis-Draft.txt'; a.click(); }} className="h-6 text-[8px] bg-white/10 text-white uppercase font-black px-4 rounded-lg border border-white/10 hover:bg-white/20 transition-all">Download</Button>
                  </header>
                  <Separator className="bg-white/5 mb-4" />
                  <textarea 
                    value={workspaceContent} onChange={(e) => setWorkspaceContent(e.target.value)}
                    className="flex-1 w-full bg-transparent text-[13px] font-medium text-foreground focus:outline-none resize-none leading-relaxed custom-scrollbar prose prose-sm dark:prose-invert placeholder:opacity-5"
                    placeholder="Drafting matrix initialized..."
                  />
                  <div className="mt-4 flex justify-between items-center opacity-30 text-[8px] font-black uppercase tracking-tighter">
                     <span>{workspaceContent.length} CHARS | {workspaceContent.split(/\s+/).length} WORDS</span>
                     <span>Sync Active</span>
                  </div>
               </div>
             )}

          </motion.div>
        )}
      </AnimatePresence>
      
      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} className="fixed left-6 top-1/2 -translate-y-1/2 size-10 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center shadow-3xl hover:scale-110 transition-all z-50 group backdrop-blur-xl"><ChevronRight className="size-5 text-muted-foreground group-hover:text-primary" /></button>
      )}

      {rightPanel === 'none' && (
        <button onClick={() => setRightPanel('vitals')} className="fixed right-6 top-1/2 -translate-y-1/2 size-12 rounded-[1.5rem] bg-black/60 border-2 border-primary/40 flex items-center justify-center shadow-3xl hover:scale-110 transition-all z-50 group backdrop-blur-xl"><BarChart3 className="size-6 text-primary group-hover:rotate-12 transition-transform" /></button>
      )}
    </div>
  )
}

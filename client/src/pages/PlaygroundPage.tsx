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
  Sparkles, Send, Mic, Paperclip, Trash2, 
  ChevronRight, Download, 
  Terminal, Activity, Zap, Cpu, History, Search,
  Clock, BarChart3, FileText, Copy
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
  { id: 'general', name: 'ผู้ช่วยทั่วไป', prompt: 'คุณคือ AI ผู้ช่วยอัจฉริยะ ของสำนักงานสาธารณสุขจังหวัดมุกดาหาร ตอบคำถามด้วยความสุภาพ ถูกต้อง และกระชับ', icon: <Sparkles className="size-4" />, theme: 'emerald' },
  { id: 'epi', name: 'ระบาดวิทยา', prompt: 'คุณคือผู้เชี่ยวชาญด้านระบาดวิทยาและสถิติสาธารณสุข ช่วยวิเคราะห์ข้อมูลแนวโน้มโรคและให้คำแนะนำตามหลักวิชาการอย่างละเอียด', icon: <Activity className="size-4" />, theme: 'sapphire' },
  { id: 'legal', name: 'งานสารบรรณ', prompt: 'คุณคือผู้เชี่ยวชาญด้านระเบียบงานสารบรรณและการร่างหนังสือราชการ ช่วยร่างข้อความหรือบันทึกข้อความให้ถูกต้องตามระเบียบสำนักนายกรัฐมนตรี', icon: <Terminal className="size-4" />, theme: 'amber' },
  { id: 'med', name: 'ทีมแพทย์', prompt: 'คุณคือ AI ที่ปรึกษาด้านการแพทย์และสาธารณสุข ให้ข้อมูลเกี่ยวกับโรค ยา และแนวทางการรักษาเบื้องต้นตามหลักการแพทย์ที่ทันสมัย', icon: <Zap className="size-4" />, theme: 'ruby' },
]

const THEMES = {
  emerald: 'from-emerald-500 via-emerald-600 to-teal-700',
  sapphire: 'from-blue-500 via-blue-600 to-indigo-700',
  ruby: 'from-rose-500 via-red-600 to-crimson-700',
  amber: 'from-amber-500 via-orange-600 to-amber-700',
}

export default function PlaygroundPage() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('chat_sessions')
    return saved ? JSON.parse(saved) : [{ id: 'default', title: 'การสนทนาใหม่', messages: [], createdAt: Date.now() }]
  })
  const [currentSessionId, setCurrentSessionId] = useState('default')
  const [activeTheme, setActiveTheme] = useState<keyof typeof THEMES>('emerald')
  const [searchQuery, setSearchQuery] = useState('')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('auto')
  const [systemPrompt, setSystemPrompt] = useState(PERSONA_PRESETS[0].prompt)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [workspaceContent, setWorkspaceContent] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  
  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0]
  const messages = currentSession.messages
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: keyData } = useQuery<{ apiKey: string }>({
    queryKey: ['public-key'],
    queryFn: () => apiFetch('/api/public/api-key'),
  })

  const { data: fallbackEntries = [] } = useQuery<FallbackEntry[]>({
    queryKey: ['public-models'],
    queryFn: () => apiFetch('/api/public/models'),
  })

  const availableModels = fallbackEntries.filter(e => e.keyCount > 0 && e.enabled)

  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      if (filtered.length === 0) return [{ id: 'default', title: 'การสนทนาใหม่', messages: [], createdAt: Date.now() }]
      return filtered
    })
    if (currentSessionId === id) {
       const remaining = sessions.filter(s => s.id !== id)
       setCurrentSessionId(remaining.length > 0 ? remaining[0].id : 'default')
    }
  }

  const deleteMessage = (id: string) => {
    const updated = messages.filter(m => m.id !== id)
    updateCurrentSession(updated)
  }

  const updateCurrentSession = (updatedMessages: ChatMessage[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        let title = s.title
        if (s.title === 'การสนทนาใหม่' && updatedMessages.length > 0) {
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
        const type = file.type.startsWith('image/') ? 'image' : 'file'
        setAttachments(prev => [...prev, { type, name: file.name, mimeType: file.type, data: base64 }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return alert('เบราว์เซอร์ไม่รองรับ')
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
    if (inputRef.current) inputRef.current.style.height = 'auto'

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
      if (!res.ok) throw new Error(data.error?.message || 'Error')

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.choices?.[0]?.message?.content || '',
        meta: { platform: data._routed_via?.platform, model: data._routed_via?.model, latency: data.usage?.latency_ms, usage: data.usage }
      }
      updateCurrentSession([...updatedMessages, assistantMsg])
      
      if (assistantMsg.content.toString().length > 400) {
        setWorkspaceContent(assistantMsg.content.toString())
        setShowWorkspace(true)
      }
    } catch (err: any) {
      updateCurrentSession([...updatedMessages, { id: (Date.now() + 1).toString(), role: 'assistant', content: `⚠️ SYSTEM FAULT: ${err.message}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    updateCurrentSession([])
    inputRef.current?.focus()
  }

  const quickAction = (prompt: string) => {
    setInput(prompt)
    setTimeout(() => handleSend(), 0)
  }

  const exportChat = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}]\n${typeof m.content === 'string' ? m.content : 'Attachment'}\n`).join('\n---\n\n')
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PHO-AI-Intelligence-${Date.now()}.md`
    a.click()
  }

  const activeModelLabel = selectedModel === 'auto' ? 'Dynamic' : selectedModel
  const totalTokens = messages.reduce((sum, m) => sum + (m.meta?.usage?.total_tokens || 0), 0)
  const avgLatency = messages.filter(m => m.role === 'assistant').length > 0 
    ? Math.round(messages.reduce((sum, m) => sum + (m.meta?.latency || 0), 0) / messages.filter(m => m.role === 'assistant').length) 
    : 0

  const groupSessions = () => {
    const groups: Record<string, ChatSession[]> = { 'วันนี้': [], 'เมื่อวาน': [], 'เก่ากว่านั้น': [] }
    const now = new Date().setHours(0,0,0,0)
    const yesterday = now - 86400000
    
    sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase())).forEach(s => {
      if (s.createdAt >= now) groups['วันนี้'].push(s)
      else if (s.createdAt >= yesterday) groups['เมื่อวาน'].push(s)
      else groups['เก่ากว่านั้น'].push(s)
    })
    return groups
  }

  return (
    <div className={`flex h-[calc(100vh-10rem)] max-w-[1600px] mx-auto w-full group/main gap-6 animate-in fade-in duration-1000 theme-${activeTheme}`}>
      
      {/* Sidebar */}
      <motion.aside initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-72 flex flex-col gap-4 shrink-0">
        <Button onClick={createNewSession} className={`w-full h-14 rounded-3xl bg-gradient-to-r ${THEMES[activeTheme]} text-white font-black shadow-xl transition-all active:scale-95 border-b-4 border-black/20 uppercase tracking-tighter text-sm`}>
          <History className="size-3 mr-2" /> แชทใหม่
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input 
            type="text" placeholder="Search insights..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 bg-white/10 border-2 border-white/10 rounded-2xl pl-10 pr-4 text-[11px] font-bold focus:outline-none focus:border-primary/40"
          />
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
          {Object.entries(groupSessions()).map(([group, items]) => items.length > 0 && (
            <div key={group} className="space-y-2">
               <span className="text-[9px] font-black uppercase text-muted-foreground ml-3 tracking-widest">{group}</span>
               {items.map(s => (
                 <div key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`group/session flex items-center justify-between p-4 rounded-3xl cursor-pointer border-2 transition-all ${currentSessionId === s.id ? 'bg-white/90 border-primary shadow-lg ring-4 ring-primary/5' : 'bg-white/30 border-white/40 hover:bg-white/50'}`}>
                    <div className="flex flex-col min-w-0 pr-4 relative w-full">
                      <span className={`text-[11px] font-black truncate ${currentSessionId === s.id ? 'text-primary' : 'text-muted-foreground'}`}>{s.title}</span>
                      <div className="flex items-center gap-2 mt-1 opacity-40">
                        <Clock className="size-2.5" />
                        <span className="text-[8px] font-bold uppercase">{new Date(s.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <button onClick={(e) => deleteSession(s.id, e)} className="absolute top-0 right-0 size-6 rounded-full flex items-center justify-center opacity-0 group-hover/session:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"><Trash2 className="size-3.5" /></button>
                    </div>
                 </div>
               ))}
            </div>
          ))}
        </div>
        <div className="p-5 rounded-[2rem] bg-white/10 border-2 border-white/20 backdrop-blur-3xl">
           <span className="text-[9px] font-black uppercase text-muted-foreground block mb-4 tracking-widest">Neural Theme</span>
           <div className="flex justify-between">
              {Object.keys(THEMES).map(t => (
                <button key={t} onClick={() => setActiveTheme(t as any)} className={`size-7 rounded-full border-2 transition-all ${activeTheme === t ? 'border-white scale-125 shadow-xl' : 'border-transparent opacity-50 hover:opacity-100'} bg-gradient-to-br ${THEMES[t as keyof typeof THEMES]}`} />
              ))}
           </div>
        </div>
      </motion.aside>

      {/* Main Area */}
      <div className={`flex-1 flex flex-col rounded-[3rem] border-4 border-white bg-white/10 dark:bg-black/40 backdrop-blur-[100px] overflow-hidden min-h-0 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] relative transition-all duration-700 ${showWorkspace ? 'flex-[0.6]' : ''}`}>
        <div className="animate-scan opacity-30" />
        <div className="h-16 shrink-0 bg-white/40 border-b-2 border-white/40 flex items-center justify-between px-8 backdrop-blur-3xl relative z-20">
           <div className="flex items-center gap-4">
              <Badge variant="outline" className={`bg-primary/20 text-primary border-primary/40 font-black uppercase text-[9px] tracking-[0.2em] h-7 px-4 rounded-full animate-pulse`}>{activeModelLabel} Active</Badge>
              <div className="flex flex-col"><span className="text-[9px] font-black text-muted-foreground uppercase leading-none mb-1">Active Session</span><span className="text-[11px] font-black text-primary uppercase truncate max-w-[300px]">{currentSession.title}</span></div>
           </div>
           <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setShowWorkspace(!showWorkspace)} className={`rounded-full h-9 px-5 font-black uppercase text-[10px] transition-all border ${showWorkspace ? 'bg-secondary text-white border-white/40 shadow-lg' : 'bg-white/40 border-white/40 hover:bg-primary/10 text-primary'}`}>
                 {showWorkspace ? <ChevronRight className="size-5" /> : <BarChart3 className="size-4 mr-2" />}
                 {!showWorkspace && 'Intelligence'}
              </Button>
              <Button variant="ghost" size="sm" onClick={exportChat} className="h-9 rounded-full text-[10px] font-black uppercase bg-white/40 text-primary px-5 border border-white/40 transition-all hover:bg-white/60"><Download className="size-4" /></Button>
              <Button variant="ghost" size="sm" onClick={handleClear} className="h-9 rounded-full text-[10px] font-black uppercase text-destructive hover:bg-destructive/10 transition-all">Purge</Button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar relative z-10 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center animate-in fade-in zoom-in duration-1000 space-y-12">
              <div className="space-y-6">
                <div className="relative size-28 mx-auto">
                   <div className="absolute inset-0 bg-primary/20 rounded-[2.5rem] blur-2xl opacity-40 animate-aura-supreme" />
                   <div className="relative size-28 bg-white rounded-[2.5rem] flex items-center justify-center shadow-3xl border-4 border-primary/20 hover:scale-110 transition-transform duration-500">
                     <Cpu className="size-14 text-primary animate-pulse" />
                   </div>
                </div>
                <div>
                  <h2 className={`text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r ${THEMES[activeTheme]} animate-plasma-vivid leading-none tracking-tighter uppercase`}>Neural Master</h2>
                  <p className="text-[11px] font-black text-muted-foreground mt-4 uppercase tracking-[0.6em]">System Intelligence Dashboard</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5 w-full max-w-2xl">
                 {PERSONA_PRESETS.map(p => (
                   <button key={p.id} onClick={() => { setSystemPrompt(p.prompt); setActiveTheme(p.theme as any); createNewSession(); }} className="flex items-center gap-5 p-5 rounded-[2.5rem] bg-white/40 hover:bg-white border-2 border-white shadow-xl transition-all hover:scale-105 text-left group">
                      <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform border border-primary/20 shadow-inner">{p.icon}</div>
                      <div className="flex flex-col"><span className="text-[12px] font-black text-primary uppercase leading-tight">{p.name}</span><span className="text-[9px] text-muted-foreground font-bold mt-1 uppercase tracking-tighter">Initialize Module</span></div>
                   </button>
                 ))}
              </div>
              <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
                 {['สรุปรายงาน', 'ร่างบันทึกข้อความ', 'ตรวจคำผิด', 'วิเคราะห์ข้อมูล'].map((txt, i) => (
                   <Button key={i} variant="ghost" onClick={() => quickAction(txt)} className="h-10 rounded-2xl bg-white/40 hover:bg-primary hover:text-white border-2 border-white text-[10px] font-black uppercase px-6 shadow-md transition-all">{txt}</Button>
                 ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg`}>
                  <div className={`relative flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div className={`rounded-[2.5rem] px-8 py-5 text-[15px] leading-relaxed shadow-2xl border-4 backdrop-blur-3xl transition-all hover:scale-[1.01] ${msg.role === 'user' ? `bg-gradient-to-br ${THEMES[activeTheme]} text-white border-white/30 rounded-tr-none shadow-primary/30` : 'bg-white/95 dark:bg-zinc-950/95 text-foreground border-white dark:border-zinc-800 rounded-tl-none shadow-black/10 ai-bubble'}`}>
                      <div className="markdown-content font-bold tracking-tight prose prose-sm prose-emerald dark:prose-invert max-w-none">
                         <ReactMarkdown remarkPlugins={[remarkGfm]}>{typeof msg.content === 'string' ? msg.content : 'Complex data matrix attached.'}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 px-8 transition-all opacity-0 group-hover/msg:opacity-100">
                      {msg.meta && <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest opacity-40"><span>{msg.meta.platform}</span><div className="size-1 rounded-full bg-current" /><span>{msg.meta.latency}ms</span></div>}
                      <div className="flex gap-4">
                        <button onClick={() => navigator.clipboard.writeText(typeof msg.content === 'string' ? msg.content : '')} className="text-[11px] font-black text-primary/40 hover:text-primary uppercase tracking-tighter flex items-center gap-1.5 transition-all"><Copy className="size-3" /> Copy</button>
                        <button onClick={() => deleteMessage(msg.id)} className="text-[11px] font-black text-destructive/40 hover:text-destructive uppercase tracking-tighter flex items-center gap-1.5 transition-all"><Trash2 className="size-3" /> Del</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {loading && (
            <div className="flex justify-start animate-in fade-in duration-300">
              <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl border-4 border-white rounded-[2.5rem] rounded-tl-none px-8 py-5 shadow-2xl flex gap-3 items-center">
                 <div className="size-2 rounded-full bg-primary animate-bounce shadow-[0_0_10px_var(--primary)]" style={{ animationDelay: '0ms' }} />
                 <div className="size-2 rounded-full bg-primary animate-bounce shadow-[0_0_10px_var(--primary)]" style={{ animationDelay: '200ms' }} />
                 <div className="size-2 rounded-full bg-primary animate-bounce shadow-[0_0_10px_var(--primary)]" style={{ animationDelay: '400ms' }} />
                 <span className="text-[12px] font-black uppercase text-primary ml-3 tracking-[0.2em]">Neural Link Processing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-8 bg-white/60 dark:bg-black/90 backdrop-blur-[150px] border-t-8 border-white/60 relative z-20 shadow-[0_-20px_100px_rgba(0,0,0,0.2)]">
          <div className="flex gap-5 mb-6 flex-wrap">
             {attachments.map((att, idx) => (
                <div key={idx} className="relative group/att animate-in zoom-in-75 duration-300">
                  {att.type === 'image' ? <img src={att.data} className="size-20 object-cover rounded-2xl border-4 border-white shadow-2xl transition-all group-hover:scale-110" alt="" /> : <div className="size-20 flex flex-col items-center justify-center bg-white rounded-2xl border-4 border-white shadow-2xl text-[8px] font-black p-3 text-center group-hover:scale-110 transition-all"><FileText className="size-8 text-primary mb-1.5" /><span className="truncate w-full uppercase">{att.name}</span></div>}
                  <button onClick={() => removeAttachment(idx)} className="absolute -top-2 -right-2 size-8 bg-destructive text-white rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-110 z-20 border-2 border-white"><Trash2 className="size-4" /></button>
                </div>
             ))}
          </div>
          <div className="flex gap-6 items-end max-w-5xl mx-auto relative group/input-dock">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
            <div className="flex gap-3 shrink-0 mb-2">
              <Button variant="ghost" size="icon" className="size-14 rounded-[1.75rem] bg-white/90 border-4 border-white shadow-2xl transition-all active:scale-90 hover:bg-primary hover:text-white" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-7" /></Button>
              <Button variant="ghost" size="icon" className={`size-14 rounded-[1.75rem] border-4 border-white shadow-2xl transition-all active:scale-90 ${isRecording ? 'bg-red-600 text-white animate-pulse shadow-[0_0_30px_red]' : 'bg-white hover:bg-primary hover:text-white'}`} onClick={handleVoiceInput}><Mic className="size-7" /></Button>
            </div>
            <div className="flex-1 relative">
              <textarea 
                ref={inputRef} value={input} onChange={e => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder="Query Intelligence Network..." rows={1} 
                className="relative w-full resize-none rounded-2xl border-[6px] border-white bg-white/95 dark:bg-zinc-950/95 px-10 py-6 text-xl font-black focus:outline-none focus:border-primary shadow-3xl transition-all min-h-[80px] max-h-[300px] placeholder:opacity-20 tracking-tighter" 
                style={{ height: 'auto', overflow: 'hidden' }} onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 300) + 'px'; }} 
              />
            </div>
            <Button onClick={handleSend} disabled={loading || !input.trim()} className={`h-20 px-14 rounded-[2rem] bg-gradient-to-br ${THEMES[activeTheme]} hover:scale-105 active:scale-95 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.4)] font-black text-white shrink-0 border-4 border-white/40 transition-all z-10`}>
              {loading ? <span className="size-10 border-8 border-white/20 border-t-white rounded-full animate-spin" /> : <Send className="size-8" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <AnimatePresence>
        {showWorkspace && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 500, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex flex-col gap-5 shrink-0 overflow-hidden">
             <div className="flex-1 rounded-[3rem] bg-white/10 dark:bg-black/40 backdrop-blur-[120px] border-4 border-white p-8 shadow-3xl relative flex flex-col group/workspace">
                <header className="flex items-center justify-between mb-6">
                   <div className="flex items-center gap-4">
                      <div className="size-10 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary border-2 border-secondary/20 shadow-inner"><FileText className="size-6" /></div>
                      <div className="flex flex-col"><span className="text-[12px] font-black uppercase text-secondary tracking-widest leading-none">Draft Matrix</span><span className="text-[9px] font-bold text-muted-foreground uppercase mt-1">Real-time Documenting</span></div>
                   </div>
                   <Button variant="ghost" size="sm" onClick={() => { const blob = new Blob([workspaceContent], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'PHO-Analysis.txt'; a.click(); }} className="h-8 text-[10px] bg-secondary/10 text-secondary uppercase font-black px-6 rounded-xl border-2 border-secondary/20 hover:bg-secondary hover:text-white transition-all">Download</Button>
                </header>
                <Separator className="bg-secondary/10 mb-8" />
                <div className="flex-1 relative">
                  <textarea value={workspaceContent} onChange={(e) => setWorkspaceContent(e.target.value)} className="w-full h-full bg-transparent text-[13px] font-bold text-foreground focus:outline-none resize-none leading-relaxed custom-scrollbar placeholder:opacity-10" placeholder="Complex data analysis will be streamed here for editing..." />
                  <div className="absolute bottom-0 right-0 p-3 opacity-30 text-[10px] font-black uppercase tracking-widest">{workspaceContent.length} Chars | {workspaceContent.split(/\s+/).length} Words</div>
                </div>
             </div>
             <div className="p-8 rounded-[3rem] bg-white/10 backdrop-blur-[150px] border-4 border-white shadow-3xl space-y-8">
                <div className="flex justify-between items-center">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Intelligence Energy</span>
                      <span className="text-3xl font-black text-secondary leading-none">{totalTokens.toLocaleString()} <span className="text-[12px] uppercase opacity-40">Tokens</span></span>
                   </div>
                   <Badge variant="outline" className="h-12 px-6 rounded-2xl border-emerald-500/30 bg-emerald-500/10 text-emerald-500 flex flex-col items-center justify-center shadow-lg"><span className="text-[16px] font-black">฿{(totalTokens * 0.000035).toFixed(4)}</span><span className="text-[9px] font-bold uppercase leading-none mt-1 tracking-widest">{avgLatency}ms Saved</span></Badge>
                </div>
                <div className="space-y-6 pt-6 border-t border-white/10">
                   <div className="space-y-3">
                      <div className="flex justify-between text-[10px] font-black uppercase text-primary tracking-widest"><span>Intelligence Core Tuning</span><span className="text-primary">{temperature}</span></div>
                      <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-2 bg-primary/20 rounded-full appearance-none cursor-pointer accent-primary" />
                   </div>
                   <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase text-primary tracking-widest block mb-2">Engine Engine Protocol</Label>
                      <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? 'auto')}>
                         <SelectTrigger className="w-full h-12 rounded-2xl bg-white/40 border-4 border-white shadow-xl text-[12px] font-black uppercase tracking-tighter px-6 transition-all hover:bg-white/60"><SelectValue /></SelectTrigger>
                         <SelectContent className="rounded-[2rem] border-white/40 backdrop-blur-3xl bg-white/95 dark:bg-zinc-950/95 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)]">
                            <SelectItem value="auto" className="font-black text-[12px] uppercase p-4">Dynamic Neural Route</SelectItem>
                            <Separator className="my-2 opacity-10" />
                            {availableModels.map(m => <SelectItem key={m.modelDbId} value={m.modelId} className="font-black text-[12px] uppercase tracking-tighter p-4">{m.displayName}</SelectItem>)}
                         </SelectContent>
                      </Select>
                   </div>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!showWorkspace && (
        <button onClick={() => setShowWorkspace(true)} className="fixed right-8 top-1/2 -translate-y-1/2 size-16 rounded-[2rem] bg-white/90 dark:bg-black/90 border-4 border-primary/40 flex items-center justify-center shadow-3xl hover:scale-110 transition-all z-50 animate-in fade-in slide-in-from-right-8 group"><BarChart3 className="size-8 text-primary group-hover:rotate-12 transition-transform" /></button>
      )}
    </div>
  )
}

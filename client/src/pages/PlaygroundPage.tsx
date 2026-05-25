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
  ChevronRight, Download, 
  Terminal, Activity, Zap, Cpu, History, Search,
  BarChart3, FileText, Copy, Pin, PinOff,
  Database, ShieldAlert, Palette
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
  emerald: 'from-emerald-500/80 via-emerald-600/80 to-teal-700/80',
  sapphire: 'from-blue-500/80 via-blue-600/80 to-indigo-700/80',
  ruby: 'from-rose-500/80 via-red-600/80 to-crimson-700/80',
  amber: 'from-amber-500/80 via-orange-600/80 to-amber-700/80',
}

export default function PlaygroundPage() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('chat_sessions')
    return saved ? JSON.parse(saved) : [{ id: 'default', title: 'Intelligence Initialized', messages: [], createdAt: Date.now() }]
  })
  const [currentSessionId, setCurrentSessionId] = useState('default')
  const [activeTheme, setActiveTheme] = useState<keyof typeof THEMES>('emerald')
  const [searchQuery, setSearchQuery] = useState('')
  const [msgSearch, setMsgSearch] = useState('')
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

  const filteredMessages = useMemo(() => {
    if (!msgSearch) return messages
    return messages.filter(m => typeof m.content === 'string' && m.content.toLowerCase().includes(msgSearch.toLowerCase()))
  }, [messages, msgSearch])

  const { data: keyData } = useQuery<{ apiKey: string }>({ queryKey: ['public-key'], queryFn: () => apiFetch('/api/public/api-key') })
  const { data: fallbackEntries = [] } = useQuery<FallbackEntry[]>({ queryKey: ['public-models'], queryFn: () => apiFetch('/api/public/models') })
  const availableModels = fallbackEntries.filter(e => e.keyCount > 0 && e.enabled)

  useEffect(() => { localStorage.setItem('chat_sessions', JSON.stringify(sessions)) }, [sessions])
  useEffect(() => { if (!msgSearch) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, msgSearch, rightPanel])

  const createNewSession = () => {
    const newSession: ChatSession = { id: Date.now().toString(), title: 'Neural Link Start', messages: [], createdAt: Date.now() }
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

  const togglePin = (msgId: string) => { updateCurrentSession(messages.map(m => m.id === msgId ? { ...m, pinned: !m.pinned } : m)) }
  const deleteMessage = (id: string) => { updateCurrentSession(messages.filter(m => m.id !== id)) }

  const updateCurrentSession = (updatedMessages: ChatMessage[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        let title = s.title
        if ((s.title === 'Neural Link Start' || s.title === 'Intelligence Initialized' || s.title === 'การสนทนาใหม่') && updatedMessages.length > 0) {
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
        setAttachments(prev => [...prev, { type: file.type.startsWith('image/') ? 'image' : 'file', name: file.name, mimeType: file.type, data: base64 }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const removeAttachment = (index: number) => { setAttachments(prev => prev.filter((_, i) => i !== index)) }

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'th-TH'
    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => setIsRecording(false)
    recognition.onresult = (event: any) => { setInput(prev => (prev ? prev + ' ' : '') + event.results[0][0].transcript) }
    recognition.start()
  }

  const handleSend = async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || loading) return
    let content: any = text
    if (attachments.length > 0) {
      content = []
      if (text) content.push({ type: 'text', text })
      attachments.forEach(att => {
        if (att.type === 'image') content.push({ type: 'image_url', image_url: { url: att.data } })
        else content.push({ type: 'file', file: { name: att.name, mimeType: att.mimeType, data: att.data } })
      })
    }
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content, timestamp: Date.now() }
    const updatedMessages = [...messages, userMsg]
    updateCurrentSession(updatedMessages)
    setInput(''); setAttachments([]); setLoading(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (keyData?.apiKey) headers['Authorization'] = `Bearer ${keyData.apiKey}`
      const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST', headers, body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, ...updatedMessages.map(m => ({ role: m.role, content: m.content }))], temperature, model: selectedModel !== 'auto' ? selectedModel : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Error')
      const assistantMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.choices?.[0]?.message?.content || '', timestamp: Date.now(), meta: { platform: data._routed_via?.platform, model: data._routed_via?.model, latency: data.usage?.latency_ms, usage: data.usage } }
      updateCurrentSession([...updatedMessages, assistantMsg])
      if (assistantMsg.content.toString().length > 400) { setWorkspaceContent(assistantMsg.content.toString()); setRightPanel('workspace') }
    } catch (err: any) { updateCurrentSession([...updatedMessages, { id: Date.now().toString(), role: 'assistant', content: `⚠️ FAULT: ${err.message}`, timestamp: Date.now() }]) } finally { setLoading(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }
  const exportChat = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}]\n${typeof m.content === 'string' ? m.content : 'Attachment'}\n`).join('\n---\n\n')
    const blob = new Blob([text], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Neural-Export-${Date.now()}.md`; a.click()
  }

  const quickAction = (prompt: string) => { setInput(prompt); setTimeout(() => handleSend(), 0) }
  const activeModelLabel = selectedModel === 'auto' ? 'Dynamic' : selectedModel
  const totalTokens = messages.reduce((sum, m) => sum + (m.meta?.usage?.total_tokens || 0), 0)

  return (
    <div className={`flex h-[calc(100vh-8rem)] max-w-[1750px] mx-auto w-full group/main gap-3 relative animate-in fade-in duration-500 theme-${activeTheme}`}>
      <AnimatePresence mode="wait">{sidebarOpen && (
        <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex flex-col gap-3 shrink-0 overflow-hidden border-r border-white/10 pr-2">
          <Button onClick={createNewSession} className={`w-full h-11 rounded-2xl bg-gradient-to-r ${THEMES[activeTheme]} text-white font-black shadow-[0_0_20px_rgba(74,222,128,0.2)] active:scale-95 transition-all text-[11px] uppercase tracking-widest border-b-4 border-black/20`}><Sparkles className="size-4 mr-2" /> New Neural Core</Button>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/40" /><input type="text" placeholder="Protocol filter..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-9 bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 text-[11px] font-bold focus:border-primary/40 outline-none transition-all text-white" /></div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
             {sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase())).map(s => (
               <div key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`group/session p-3 rounded-2xl cursor-pointer border transition-all ${currentSessionId === s.id ? 'bg-white/15 border-primary shadow-inner' : 'bg-transparent border-transparent hover:bg-white/5'}`}>
                  <div className="flex items-center gap-3"><div className={`size-1.5 rounded-full ${currentSessionId === s.id ? 'bg-primary animate-pulse shadow-[0_0_10px_var(--primary)]' : 'bg-white/20'}`} /><span className={`text-[11px] font-bold truncate flex-1 ${currentSessionId === s.id ? 'text-white' : 'text-white/40 group-hover:text-white/60'}`}>{s.title}</span><button onClick={(e) => deleteSession(s.id, e)} className="opacity-0 group-hover/session:opacity-100 text-white/20 hover:text-destructive transition-all"><Trash2 className="size-4" /></button></div>
               </div>
             ))}
          </div>
          <div className="p-4 rounded-[2rem] bg-white/5 border border-white/10 space-y-4"><div className="flex justify-between items-center"><span className="text-[9px] font-black uppercase text-white/40 tracking-widest">Neural Aura</span><Palette className="size-3 opacity-30 text-primary" /></div><div className="flex justify-between gap-1">{Object.keys(THEMES).map(t => (<button key={t} onClick={() => setActiveTheme(t as any)} className={`size-7 rounded-full border-2 transition-all ${activeTheme === t ? 'border-white scale-110 shadow-glow' : 'border-transparent opacity-30 hover:opacity-60'} bg-gradient-to-br ${THEMES[t as keyof typeof THEMES]}`} />))}</div></div>
        </motion.aside>
      )}</AnimatePresence>

      <div className={`flex-1 flex flex-col rounded-[2.5rem] border-2 border-white/15 bg-black/40 backdrop-blur-[120px] overflow-hidden min-h-0 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative transition-all duration-500`}><div className="animate-scan-vivid" />
        <header className="h-14 shrink-0 bg-white/5 border-b border-white/10 flex items-center justify-between px-6 backdrop-blur-3xl relative z-20"><div className="flex items-center gap-4"><button onClick={() => setSidebarOpen(!sidebarOpen)} className="size-9 rounded-xl hover:bg-white/10 flex items-center justify-center transition-all text-white/40 hover:text-white"><History className="size-5" /></button><Separator orientation="vertical" className="h-5 bg-white/10" /><div className="flex items-center gap-3"><Badge variant="outline" className="text-[9px] h-6 px-3 bg-primary/20 border-primary/40 text-primary font-black uppercase tracking-[0.2em] animate-pulse">{activeModelLabel} Active</Badge><span className="text-[11px] font-black text-white/60 uppercase tracking-tighter truncate max-w-[250px]">{currentSession.title}</span></div></div>
           <div className="flex items-center gap-3"><div className="relative group/msgsearch"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/20" /><input type="text" placeholder="Search protocol..." value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)} className="w-32 h-8 bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 text-[10px] font-bold focus:w-48 outline-none transition-all text-white" /></div><div className="flex bg-white/5 rounded-xl border border-white/10 p-1"><button onClick={() => setRightPanel('vitals')} className={`h-7 px-4 rounded-lg text-[9px] font-black uppercase transition-all ${rightPanel === 'vitals' ? 'bg-primary text-white shadow-glow' : 'hover:bg-white/5 text-white/40'}`}>Vitals</button><button onClick={() => setRightPanel('workspace')} className={`h-7 px-4 rounded-lg text-[9px] font-black uppercase transition-all ${rightPanel === 'workspace' ? 'bg-secondary text-white shadow-glow' : 'hover:bg-white/5 text-white/40'}`}>Workspace</button><button onClick={() => setRightPanel('none')} className="size-7 flex items-center justify-center hover:bg-white/5 text-white/40 rounded-lg transition-all"><ChevronRight className="size-4" /></button></div><Button variant="ghost" size="sm" onClick={exportChat} className="h-9 rounded-xl text-[10px] font-black uppercase bg-white/5 border border-white/10 hover:bg-white/10 text-white px-5 transition-all"><Download className="size-4" /></Button></div></header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10 scroll-smooth">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-12"><div className="space-y-6"><motion.div animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }} className="relative size-24 mx-auto"><div className="absolute inset-0 bg-primary/30 rounded-full blur-3xl animate-aura-vivid" /><Cpu className="size-24 text-primary opacity-60 drop-shadow-[0_0_15px_var(--primary)]" /></motion.div><h2 className={`text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r ${THEMES[activeTheme]} animate-plasma uppercase tracking-[0.3em] leading-none`}>Neural Nexus</h2></div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-xl">{PERSONA_PRESETS.map(p => (<button key={p.id} onClick={() => { setSystemPrompt(p.prompt); setActiveTheme(p.theme as any); createNewSession(); }} className="flex items-center gap-4 p-5 rounded-[2.5rem] bg-white/5 hover:bg-white/10 border border-white/10 shadow-2xl transition-all hover:scale-[1.03] text-left group"><div className={`size-11 rounded-2xl bg-zinc-800 flex items-center justify-center text-primary border border-white/10 group-hover:scale-110 transition-transform`}>{p.icon}</div><div className="flex flex-col"><span className="text-[12px] font-black text-white uppercase leading-none">{p.name}</span><span className="text-[9px] text-white/20 font-bold mt-1 uppercase tracking-tighter">Initialize Module</span></div></button>))}</div>
              <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl">{['สรุปรายงาน', 'ร่างบันทึกข้อความ', 'วิเคราะห์ข้อมูล'].map((txt, i) => (<Button key={i} variant="ghost" onClick={() => quickAction(txt)} className="h-10 rounded-2xl bg-white/5 hover:bg-primary hover:text-white border border-white/10 text-[10px] font-black uppercase px-6 transition-all shadow-xl">{txt}</Button>))}</div></div>
          ) : (<AnimatePresence initial={false}>{filteredMessages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg relative`}><div className={`relative flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div className={`rounded-[2.25rem] px-7 py-4 text-[14.5px] leading-relaxed shadow-[0_15px_50px_-10px_rgba(0,0,0,0.4)] border transition-all ${msg.role === 'user' ? `bg-gradient-to-br ${THEMES[activeTheme]} text-white border-white/20 rounded-tr-none shadow-glow-sm` : 'bg-zinc-900/90 text-white border-white/10 rounded-tl-none ai-bubble-glow'}`}><div className="markdown-content font-medium tracking-tight prose prose-sm prose-emerald dark:prose-invert max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{typeof msg.content === 'string' ? msg.content : 'Multi-modal data link connected.'}</ReactMarkdown></div></div>
                    <div className="flex items-center gap-4 mt-2 px-4 transition-all opacity-0 group-hover/msg:opacity-100"><span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{new Date(msg.timestamp).toLocaleTimeString()}</span><button onClick={() => togglePin(msg.id)} className={`transition-all ${msg.pinned ? 'text-amber-500 scale-125 drop-shadow-[0_0_10px_orange]' : 'text-white/20 hover:text-white'}`}>{msg.pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}</button><button onClick={() => navigator.clipboard.writeText(typeof msg.content === 'string' ? msg.content : '')} className="text-[10px] font-black text-primary/40 hover:text-primary uppercase flex items-center gap-1.5"><Copy className="size-3" /> Copy</button><button onClick={() => deleteMessage(msg.id)} className="text-[10px] font-black text-destructive/40 hover:text-destructive uppercase flex items-center gap-1.5"><Trash2 className="size-3" /> Del</button>{msg.meta && <span className="text-[9px] font-black text-white/15 uppercase">{msg.meta.model} · {msg.meta.latency}ms</span>}</div></div></motion.div>))}</AnimatePresence>)}
          {loading && (<div className="flex justify-start"><div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 flex items-center gap-3 backdrop-blur-3xl shadow-xl"><div className="flex gap-1.5">{[0, 1, 2].map(i => <div key={i} className="size-2 rounded-full bg-primary animate-bounce shadow-[0_0_12px_var(--primary)]" style={{ animationDelay: `${i * 150}ms` }} />)}</div><span className="text-[11px] font-black uppercase text-primary tracking-[0.2em] leading-none">Neural Link Synced</span></div></div>)}<div ref={messagesEndRef} />
        </div>

        <div className="p-6 bg-white/5 border-t border-white/10 relative z-20 backdrop-blur-3xl"><div className="flex gap-4 mb-4 flex-wrap">{attachments.map((att, idx) => (
                <div key={idx} className="relative group/att animate-in zoom-in-75 duration-300">{att.type === 'image' ? <img src={att.data} className="size-16 object-cover rounded-2xl border-2 border-white/20 shadow-2xl" alt="" /> : <div className="size-16 flex flex-col items-center justify-center bg-white/5 rounded-2xl border-2 border-white/20 shadow-2xl text-[8px] font-black p-3 text-center group-hover:scale-110 transition-all"><FileText className="size-6 text-primary mb-1" /><span className="truncate w-full uppercase">{att.name}</span></div>}<button onClick={() => removeAttachment(idx)} className="absolute -top-2 -right-2 size-6 bg-destructive text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 z-20 border-2 border-white"><Trash2 className="size-3.5" /></button></div>))}</div>
          <div className="flex gap-4 items-end max-w-5xl mx-auto relative group/input-nexus"><input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple /><div className="flex gap-2 shrink-0 mb-1.5"><Button variant="ghost" size="icon" className="size-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 transition-all active:scale-90" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-5" /></Button><Button variant="ghost" size="icon" className={`size-11 rounded-2xl border transition-all active:scale-90 ${isRecording ? 'bg-red-600/20 border-red-500 text-red-500 animate-pulse' : 'bg-white/5 border-white/10 hover:bg-white/15'}`} onClick={handleVoiceInput}><Mic className="size-5" /></Button></div><div className="flex-1 relative"><textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Submit query to neural link..." rows={1} className="relative w-full resize-none rounded-[1.75rem] border-2 border-white/10 bg-white/5 px-6 py-3.5 text-[15px] font-medium text-white focus:border-primary focus:bg-white/10 outline-none transition-all min-h-[50px] max-h-[220px] custom-scrollbar placeholder:opacity-20" style={{ height: 'auto', overflow: 'hidden' }} onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px'; }} /></div><Button onClick={handleSend} disabled={loading || !input.trim()} className={`h-12 px-9 rounded-2xl bg-gradient-to-br ${THEMES[activeTheme]} hover:brightness-125 active:scale-95 shadow-glow font-black text-white shrink-0 transition-all border-b-4 border-black/20`}><Send className="size-5" /></Button></div><div className="mt-4 flex items-center justify-center gap-8 opacity-20 group-hover/main:opacity-40 transition-all duration-1000"><div className="h-px flex-1 bg-white/10" /><p className="text-[8px] font-black uppercase tracking-[0.6em] text-white whitespace-nowrap">Neural Matrix v6.0 · Intelligence System Protocol</p><div className="h-px flex-1 bg-white/10" /></div></div>
      </div>

      <AnimatePresence>{rightPanel !== 'none' && (<motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 450, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex flex-col gap-3 shrink-0 overflow-hidden">
             {rightPanel === 'vitals' && (<div className="flex flex-col gap-3 h-full"><div className="p-6 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-8 shadow-3xl"><div className="flex justify-between items-center"><div className="flex flex-col"><span className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Matrix Energy</span><span className="text-2xl font-black text-secondary leading-none tabular-nums tracking-tighter">{totalTokens.toLocaleString()} <span className="text-[11px] opacity-30 uppercase ml-1">T</span></span></div><Badge variant="outline" className="h-10 px-5 rounded-2xl border-emerald-500/20 bg-emerald-500/5 text-emerald-400 flex flex-col items-center justify-center shadow-glow-sm"><span className="text-[13px] font-black tabular-nums">฿{(totalTokens * 0.000035).toFixed(4)}</span><span className="text-[8px] font-bold uppercase mt-1">Saved</span></Badge></div><div className="space-y-5 pt-6 border-t border-white/5"><div className="space-y-3"><div className="flex justify-between text-[10px] font-black uppercase text-primary/60 tracking-widest"><span>Intelligence Tuning</span><span className="text-primary">{temperature}</span></div><input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary" /></div><div className="space-y-3"><Label className="text-[10px] font-black uppercase text-primary/60 block mb-2 tracking-widest">Core Engine</Label><Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? 'auto')}><SelectTrigger className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-tighter px-4 shadow-inner text-white transition-all hover:bg-white/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-2xl border-white/10 backdrop-blur-3xl bg-zinc-950 shadow-[0_20px_100px_rgba(0,0,0,0.5)]"><SelectItem value="auto" className="font-black text-[11px] uppercase p-4 text-white">Dynamic Routing</SelectItem><Separator className="my-1 opacity-5" />{availableModels.map(m => <SelectItem key={m.modelDbId} value={m.modelId} className="font-black text-[11px] uppercase tracking-tighter p-4 text-white">{m.displayName}</SelectItem>)}</SelectContent></Select></div></div></div><div className="flex-1 rounded-[2.5rem] bg-white/5 border border-white/10 p-6 shadow-3xl flex flex-col gap-5"><div className="flex items-center gap-3"><div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner"><Database className="size-5" /></div><span className="text-[11px] font-black uppercase text-white/60 tracking-[0.2em] leading-none">System Identity</span></div><textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="flex-1 w-full bg-black/20 text-[13px] font-medium text-white/80 focus:text-white focus:outline-none resize-none leading-relaxed custom-scrollbar placeholder:opacity-5 border border-white/5 rounded-2xl p-4 shadow-inner transition-all" placeholder="Define system persona..." /><div className="flex items-center gap-2.5 text-amber-500/60 text-[9px] font-black uppercase bg-amber-500/5 p-3 rounded-xl border border-amber-500/10"><ShieldAlert className="size-4" /><span>Protocol Override Active.</span></div></div></div>)}
             {rightPanel === 'workspace' && (<div className="flex-1 rounded-[3rem] bg-white/5 dark:bg-black/40 backdrop-blur-[100px] border border-white/15 p-8 shadow-[0_0_80px_rgba(0,0,0,0.5)] relative flex flex-col h-full animate-in zoom-in-95 duration-500"><header className="flex items-center justify-between mb-6"><div className="flex items-center gap-4"><div className="size-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary border border-secondary/20 shadow-glow-sm"><FileText className="size-6" /></div><span className="text-[12px] font-black uppercase text-white/60 tracking-[0.3em] leading-none">Draft Matrix</span></div><Button variant="ghost" size="sm" onClick={() => { const blob = new Blob([workspaceContent], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Analysis-Draft.txt'; a.click(); }} className="h-6 text-[10px] bg-white/10 text-white uppercase font-black px-6 rounded-xl border border-white/10 hover:bg-white/20 transition-all shadow-xl">Export Draft</Button></header><Separator className="bg-white/5 mb-6" /><textarea value={workspaceContent} onChange={(e) => setWorkspaceContent(e.target.value)} className="flex-1 w-full bg-transparent text-[15px] font-medium text-white/90 focus:text-white focus:outline-none resize-none leading-relaxed custom-scrollbar prose prose-sm dark:prose-invert placeholder:opacity-5" placeholder="Drafting matrix initialized..." /><div className="mt-6 flex justify-between items-center opacity-30 text-[10px] font-black uppercase tracking-[0.2em]"><span>{workspaceContent.length} CHARS | {workspaceContent.split(/\s+/).length} WORDS</span><span className="animate-pulse text-emerald-400">Live Sync Active</span></div></div>)}
          </motion.div>)}</AnimatePresence>
      {!sidebarOpen && (<button onClick={() => setSidebarOpen(true)} className="fixed left-8 top-1/2 -translate-y-1/2 size-12 rounded-2xl bg-black/60 border-2 border-white/10 flex items-center justify-center shadow-3xl hover:scale-110 transition-all z-50 group backdrop-blur-3xl"><ChevronRight className="size-6 text-white/40 group-hover:text-primary" /></button>)}
      {rightPanel === 'none' && (<button onClick={() => setRightPanel('vitals')} className="fixed right-8 top-1/2 -translate-y-1/2 size-16 rounded-[2.25rem] bg-black/60 border-2 border-primary/40 flex items-center justify-center shadow-3xl hover:scale-110 transition-all z-50 group backdrop-blur-3xl"><BarChart3 className="size-8 text-primary group-hover:rotate-12 transition-transform" /></button>)}
    </div>
  )
}

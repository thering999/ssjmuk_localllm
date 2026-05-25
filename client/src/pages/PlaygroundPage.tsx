import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
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
  { id: 'general', name: 'ผู้ช่วยทั่วไป', prompt: 'คุณคือ AI ผู้ช่วยอัจฉริยะ ของสำนักงานสาธารณสุขจังหวัดมุกดาหาร ตอบคำถามด้วยความสุภาพ ถูกต้อง และกระชับ', icon: '🤖' },
  { id: 'epi', name: 'ระบาดวิทยา', prompt: 'คุณคือผู้เชี่ยวชาญด้านระบาดวิทยาและสถิติสาธารณสุข ช่วยวิเคราะห์ข้อมูลแนวโน้มโรคและให้คำแนะนำตามหลักวิชาการอย่างละเอียด', icon: '📊' },
  { id: 'admin', name: 'งานสารบรรณ', prompt: 'คุณคือผู้เชี่ยวชาญด้านระเบียบงานสารบรรณและการร่างหนังสือราชการ ช่วยร่างข้อความหรือบันทึกข้อความให้ถูกต้องตามระเบียบสำนักนายกรัฐมนตรี', icon: '📜' },
  { id: 'doctor', name: 'ทีมแพทย์', prompt: 'คุณคือ AI ที่ปรึกษาด้านการแพทย์และสาธารณสุข ให้ข้อมูลเกี่ยวกับโรค ยา และแนวทางการรักษาเบื้องต้นตามหลักการแพทย์ที่ทันสมัย', icon: '🩺' },
]

export default function PlaygroundPage() {
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
  const [showInspector, setShowInspector] = useState(false)
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
       const others = sessions.filter(s => s.id !== id)
       if (others.length > 0) setCurrentSessionId(others[0].id)
       else setCurrentSessionId('default')
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
      const transcript = event.results[0][0].transcript
      setInput(prev => (prev ? prev + ' ' : '') + transcript)
    }
    recognition.start()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const speakMessage = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'th-TH'
    window.speechSynthesis.speak(utterance)
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
    } catch (err: any) {
      updateCurrentSession([...updatedMessages, { id: (Date.now() + 1).toString(), role: 'assistant', content: `⚠️ Error: ${err.message}` }])
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
    a.download = `chat-export-${Date.now()}.md`
    a.click()
  }

  const activeModelLabel = selectedModel === 'auto' ? 'Smart Auto-Route' : selectedModel
  const totalTokensUsed = messages.reduce((sum, m) => sum + (m.meta?.usage?.total_tokens || 0), 0)
  const avgLatency = messages.length > 0 ? Math.round(messages.reduce((sum, m) => sum + (m.meta?.latency || 0), 0) / messages.filter(m => m.role === 'assistant').length || 0) : 0

  return (
    <div className="flex h-[calc(100vh-12rem)] max-w-[1600px] mx-auto w-full group/main gap-6 animate-in fade-in duration-1000">
      
      {/* Sidebar */}
      <div className="w-72 flex flex-col gap-4 shrink-0">
        <Button onClick={createNewSession} className="w-full h-14 rounded-3xl bg-primary hover:bg-primary/90 text-white font-black shadow-xl transition-all active:scale-95 border-b-4 border-black/20 uppercase tracking-tighter text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          แชทใหม่
        </Button>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
          {sessions.map(s => (
            <div key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`group/session flex items-center justify-between p-4 rounded-3xl cursor-pointer border-2 transition-all ${currentSessionId === s.id ? 'bg-white/80 border-primary shadow-lg ring-4 ring-primary/5' : 'bg-white/30 border-white/40 hover:bg-white/50'}`}>
              <div className="flex flex-col min-w-0">
                <span className={`text-[11px] font-black truncate ${currentSessionId === s.id ? 'text-primary' : 'text-muted-foreground'}`}>{s.title}</span>
                <span className="text-[8px] opacity-40 font-bold uppercase">{new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
              <button onClick={(e) => deleteSession(s.id, e)} className="size-7 rounded-full flex items-center justify-center opacity-0 group-hover/session:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col rounded-[3rem] border-4 border-white bg-white/10 dark:bg-black/40 backdrop-blur-[100px] overflow-hidden min-h-0 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] relative">
        <div className="animate-scan opacity-30" />
        <div className="h-16 shrink-0 bg-white/40 border-b-2 border-white/40 flex items-center justify-between px-8 backdrop-blur-3xl relative z-20">
           <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-primary/20 text-primary border-primary/40 font-black uppercase text-[8px] tracking-[0.2em] h-6 px-3 rounded-full">Neural Active</Badge>
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary truncate max-w-[200px]">{currentSession.title}</span>
           </div>
           <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setShowInspector(!showInspector)} className={`rounded-full h-8 px-4 font-black uppercase text-[9px] transition-all border ${showInspector ? 'bg-secondary text-white border-white/40 shadow-lg' : 'bg-white/40 border-white/40 hover:bg-primary/10 text-primary'}`}>
                 {showInspector ? 'Hide Vitals' : 'AI Vitals'}
              </Button>
              <Button variant="ghost" size="sm" onClick={exportChat} className="h-8 rounded-full text-[9px] font-black uppercase bg-white/40 text-primary px-4 border border-white/40">Export</Button>
              <Button variant="ghost" size="sm" onClick={handleClear} className="h-8 rounded-full text-[9px] font-black uppercase text-destructive hover:bg-destructive/10">Purge</Button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center animate-in fade-in zoom-in duration-1000 space-y-10">
              <div className="space-y-4">
                <div className="relative size-24 mx-auto">
                   <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-2xl opacity-40 animate-aura-supreme" />
                   <div className="relative size-24 bg-white rounded-3xl flex items-center justify-center shadow-xl border-4 border-primary/20 hover:scale-110 transition-transform duration-500">
                     <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary animate-pulse"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>
                   </div>
                </div>
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent bg-[length:200%_auto] animate-plasma-vivid leading-none tracking-tighter uppercase">Neural Master</h2>
                <p className="text-[9px] font-black text-primary mt-4 uppercase tracking-[0.6em] opacity-80 border-t border-primary/10 pt-4">ACTIVE: {activeModelLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
                 {PERSONA_PRESETS.map(p => (
                   <button key={p.id} onClick={() => { setSystemPrompt(p.prompt); createNewSession(); }} className="flex items-center gap-4 p-4 rounded-3xl bg-white/40 hover:bg-white border-2 border-white shadow-lg transition-all hover:scale-105 text-left group"><span className="text-3xl grayscale group-hover:grayscale-0 transition-all">{p.icon}</span><div className="flex flex-col"><span className="text-[11px] font-black text-primary uppercase leading-none">{p.name}</span><span className="text-[9px] text-muted-foreground font-bold mt-1 uppercase tracking-tighter">Activate Module</span></div></button>
                 ))}
              </div>
              <div className="grid grid-cols-4 gap-2 w-full max-w-xl">
                 {[
                   { label: 'สรุป', prompt: 'สรุปข้อความนี้:' },
                   { label: 'บันทึก', prompt: 'ร่างบันทึกข้อความ:' },
                   { label: 'แก้คำผิด', prompt: 'ตรวจคำผิด:' },
                   { label: 'แปลไทย', prompt: 'แปลเป็นไทย:' }
                 ].map((act, i) => (
                   <Button key={i} variant="ghost" onClick={() => quickAction(act.prompt)} className="h-8 rounded-xl bg-white/40 hover:bg-primary hover:text-white border border-white text-[8px] font-black uppercase">{act.label}</Button>
                 ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-500 group/msg`}>
                  <div className={`relative flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div className={`rounded-[2rem] px-6 py-3.5 text-sm leading-relaxed shadow-xl border-2 backdrop-blur-2xl transition-all hover:scale-[1.01] ${msg.role === 'user' ? 'bg-gradient-to-br from-primary via-primary to-secondary text-white border-white/20 rounded-tr-none shadow-primary/30' : 'bg-white/95 dark:bg-zinc-950/95 text-foreground border-white dark:border-zinc-800 rounded-tl-none shadow-black/5 ai-bubble'}`}>
                      {Array.isArray(msg.content) ? (
                        <div className="space-y-4">
                          {msg.content.map((part, pi) => {
                            if (part.type === 'text') return <div key={pi} className="markdown-content font-bold tracking-tight prose prose-sm prose-emerald dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown></div>
                            if (part.type === 'image_url') return <div key={pi} className="relative group/img overflow-hidden rounded-2xl border-4 border-white shadow-lg"><img src={part.image_url.url} className="max-w-full" alt="" /></div>
                            if (part.type === 'file') return <div className="flex items-center gap-3 p-3 bg-white/10 rounded-2xl border-2 border-white/40 text-xs font-black shadow-inner group/file cursor-pointer"><div className="size-10 bg-white text-primary rounded-xl flex items-center justify-center shadow-lg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></div><div className="flex flex-col"><span className="truncate max-w-[150px] text-sm">{part.file.name}</span><span className="text-[8px] opacity-60 uppercase tracking-widest">{part.file.mimeType}</span></div></div>
                            return null
                          })}
                        </div>
                      ) : (
                        <div className="markdown-content font-bold tracking-tight prose prose-sm prose-emerald dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content as string}</ReactMarkdown></div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 px-4 transition-all opacity-0 group-hover/msg:opacity-100">
                      {msg.meta && <div className="flex items-center gap-3 text-[8px] font-black uppercase tracking-widest opacity-40"><span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20">{msg.meta.platform} · {msg.meta.model}</span><span className="text-secondary">{msg.meta.latency} ms</span>{msg.meta.usage && <span className="text-accent">{msg.meta.usage.total_tokens} T</span>}</div>}
                      <div className="flex items-center gap-1 ml-auto">
                        <button onClick={() => copyToClipboard(typeof msg.content === 'string' ? msg.content : '')} className="size-7 rounded-full bg-white/60 hover:bg-primary hover:text-white transition-all shadow-md flex items-center justify-center border border-white"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
                        <button onClick={() => speakMessage(typeof msg.content === 'string' ? msg.content : '')} className="size-7 rounded-full bg-white/60 hover:bg-secondary hover:text-white transition-all shadow-md flex items-center justify-center border border-white"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 10 0 0 1 0 7.08"/></svg></button>
                        <button onClick={() => deleteMessage(msg.id)} className="size-7 rounded-full bg-white/60 hover:bg-destructive hover:text-white transition-all shadow-md flex items-center justify-center border border-white"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start animate-in fade-in duration-300">
                  <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl border-2 border-white rounded-[2rem] rounded-tl-none px-6 py-4 shadow-xl"><div className="flex gap-2"><div className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} /><div className="size-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '150ms' }} /><div className="size-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} /></div></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="p-6 bg-white/60 dark:bg-black/90 backdrop-blur-[120px] border-t-4 border-white/60 relative z-20 shadow-[0_-15px_80px_rgba(0,0,0,0.15)]">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-4 mb-5 p-4 bg-white/30 rounded-[2rem] border-4 border-dashed border-white/60 shadow-inner relative group/att-container overflow-hidden ring-4 ring-white/10 animate-in slide-in-from-bottom-4"><div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 animate-plasma-vivid" />{attachments.map((att, idx) => (
                <div key={idx} className="relative group/att animate-in zoom-in-75 duration-500 relative z-10">{att.type === 'image' ? <img src={att.data} className="size-16 object-cover rounded-xl border-2 border-white shadow-xl transition-all" alt="" /> : <div className="size-16 flex flex-col items-center justify-center bg-white rounded-xl border-2 border-white shadow-xl text-[7px] font-black p-2 text-center group-hover/att:scale-110 transition-all duration-300"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></div>}<button onClick={() => removeAttachment(idx)} className="absolute -top-1.5 -right-1.5 size-6 bg-destructive text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 z-20"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>
              ))}</div>
          )}
          
          <div className="flex gap-4 items-end max-w-4xl mx-auto relative group/input-dock">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/*,.pdf,.txt" />
            <div className="flex gap-2 shrink-0 mb-1.5">
              <Button variant="ghost" size="icon" className="size-11 rounded-2xl bg-white border-2 border-white shadow-xl transition-all active:scale-90 hover:bg-primary hover:text-white" onClick={() => fileInputRef.current?.click()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></Button>
              <Button variant="ghost" size="icon" className={`size-11 rounded-2xl border-2 border-white shadow-xl transition-all active:scale-90 group/btn ring-4 ring-white/10 ${isRecording ? 'bg-red-600 text-white animate-pulse shadow-[0_0_20px_red]' : 'bg-white hover:bg-primary hover:text-white'}`} onClick={handleVoiceInput}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></Button>
            </div>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="ป้อนคำสั่ง AI อัจฉริยะ..." rows={1} className="relative w-full resize-none rounded-2xl border-2 border-white bg-white/95 dark:bg-zinc-950/95 px-6 py-4 text-[15px] font-bold focus:outline-none focus:border-primary shadow-xl transition-all min-h-[50px] max-h-[250px] placeholder:opacity-30 tracking-tight" style={{ height: 'auto', overflow: 'hidden' }} onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 250) + 'px'; }} />
            <Button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)} size="lg" className="h-[50px] px-8 rounded-2xl bg-gradient-to-br from-primary via-primary to-secondary hover:scale-105 active:scale-95 shadow-xl font-black text-white shrink-0 group/send border-2 border-white/20">{loading ? <span className="size-6 border-4 border-white/40 border-t-white rounded-full animate-spin" /> : <div className="flex items-center gap-2 text-xs uppercase tracking-tighter"><span>SEND</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>}</Button>
          </div>
          <div className="mt-4 flex items-center justify-center gap-8 opacity-20 group-hover/main:opacity-50 transition-all duration-1000"><div className="h-px flex-1 bg-primary/40" /><p className="text-[7px] font-black uppercase tracking-[0.6em] text-primary whitespace-nowrap drop-shadow-sm">Advanced AI Interface · Mukdahan PHO</p><div className="h-px flex-1 bg-primary/40" /></div>
        </div>
      </div>

      {/* Right Sidebar */}
      {showInspector && (
        <div className="w-64 flex flex-col gap-4 shrink-0 animate-in slide-in-from-right-10 duration-700">
           <div className="p-6 rounded-[2.5rem] glass-premium border-2 border-secondary/20 shadow-2xl space-y-6">
              <div className="space-y-1">
                 <span className="text-[10px] font-black uppercase text-secondary tracking-widest block leading-none mb-2">Live AI Vitals</span>
                 <div className="h-1 w-full bg-secondary/10 rounded-full overflow-hidden"><div className="h-full bg-secondary animate-pulse" style={{ width: '85%' }} /></div>
              </div>
              <div className="space-y-4">
                 <div className="flex flex-col"><span className="text-[18px] font-black text-secondary tabular-nums leading-none">{totalTokensUsed.toLocaleString()}</span><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Session Tokens</span></div>
                 <div className="flex flex-col"><span className="text-[18px] font-black text-secondary tabular-nums leading-none">{avgLatency} ms</span><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Avg Response</span></div>
                 <div className="flex flex-col"><span className="text-[18px] font-black text-emerald-500 tabular-nums leading-none">฿{(totalTokensUsed * 0.000035).toFixed(4)}</span><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Efficiency Value</span></div>
              </div>
              <Separator className="bg-secondary/10" />
              <div className="space-y-4">
                 <Label className="text-[9px] font-black uppercase text-primary tracking-widest">Master Tuning</Label>
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter"><span>Creative Force</span><span>{temperature}</span></div>
                    <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-1 bg-primary/20 rounded-full appearance-none cursor-pointer accent-primary" />
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase text-primary tracking-widest">Model Engine</Label>
                    <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? 'auto')}>
                       <SelectTrigger className="w-full h-10 rounded-xl bg-white/40 dark:bg-black/20 border-white/20 text-[10px] font-black uppercase tracking-tighter px-4 shadow-md transition-all"><SelectValue /></SelectTrigger>
                       <SelectContent className="rounded-2xl border-white/40 backdrop-blur-3xl bg-white/95 dark:bg-zinc-950/95">
                          <SelectItem value="auto" className="font-bold text-[11px]">Smart Auto</SelectItem>
                          {availableModels.map(m => <SelectItem key={m.modelDbId} value={m.modelId} className="font-bold text-[11px] uppercase tracking-tighter">{m.displayName}</SelectItem>)}
                       </SelectContent>
                    </Select>
                 </div>
              </div>
           </div>
           <div className="flex-1 rounded-[2.5rem] glass-premium border-2 border-white/40 p-6 shadow-2xl relative overflow-hidden group/sys">
              <div className="absolute inset-0 bg-primary/5 animate-pulse opacity-50 pointer-events-none" />
              <Label className="text-[9px] font-black uppercase text-primary tracking-widest block mb-3 border-b border-primary/20 pb-2">AI Context Matrix</Label>
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-[calc(100%-3rem)] bg-transparent text-[11px] font-bold text-foreground focus:outline-none resize-none leading-relaxed custom-scrollbar placeholder:opacity-20" placeholder="นิยามบทบาทผู้ช่วย AI..." />
           </div>
        </div>
      )}
    </div>
  )
}

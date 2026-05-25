import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'

interface FallbackEntry {
  modelDbId: number
  priority: number
  enabled: boolean
  platform: string
  modelId: string
  displayName: string
  sizeLabel: string
  keyCount: number
}

interface Attachment {
  type: 'image' | 'file'
  name: string
  mimeType: string
  data: string // base64
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | any[]
  meta?: {
    platform?: string
    model?: string
    latency?: number
    fallbackAttempts?: number
  }
}

export default function PlaygroundPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('auto')
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        const type = file.type.startsWith('image/') ? 'image' : 'file'
        setAttachments(prev => [...prev, {
          type,
          name: file.name,
          mimeType: file.type,
          data: base64
        }])
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
    if (!SpeechRecognition) {
      alert('เบราว์เซอร์ของคุณไม่รองรับการสั่งงานด้วยเสียง')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'th-TH'
    recognition.interimResults = false

    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => setIsRecording(false)
    recognition.onerror = () => setIsRecording(false)

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(prev => (prev ? prev + ' ' : '') + transcript)
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
        if (att.type === 'image') {
          content.push({ type: 'image_url', image_url: { url: att.data } })
        } else {
          content.push({
            type: 'file',
            file: {
              name: att.name,
              mimeType: att.mimeType,
              data: att.data
            }
          })
        }
      }
    }

    const userMsg: ChatMessage = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setAttachments([])
    setLoading(true)
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (keyData?.apiKey) headers['Authorization'] = `Bearer ${keyData.apiKey}`

      const body: any = {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      }
      if (selectedModel !== 'auto') body.model = selectedModel

      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        setMessages([...newMessages, {
          role: 'assistant',
          content: `Error: ${err.error?.message ?? 'Unknown error'}`,
        }])
        return
      }

      const data = await res.json()
      const assistantContent = data.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2)
      const via = data._routed_via

      setMessages([...newMessages, {
        role: 'assistant',
        content: assistantContent,
        meta: {
          platform: via?.platform,
          model: via?.model,
          latency: data.usage?.latency_ms,
        },
      }])
    } catch (err: any) {
      setMessages([...newMessages, {
        role: 'assistant',
        content: `Error: ${err.message}`,
      }])
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
    setMessages([])
    inputRef.current?.focus()
  }

  const activeModelLabel = selectedModel === 'auto'
    ? 'ระบบอัตโนมัติ'
    : availableModels.find(m => m.modelId === selectedModel)?.displayName ?? selectedModel

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-4xl mx-auto w-full group/main">
      <PageHeader
        title="AI Playground"
        description="ระบบ AI สสจ.มุกดาหาร"
        actions={
          <div className="flex items-center gap-2 bg-white/40 dark:bg-black/30 backdrop-blur-3xl p-1 rounded-full border border-white/40 shadow-xl">
            <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? 'auto')}>
              <SelectTrigger className="w-[200px] h-8 bg-transparent border-none shadow-none focus:ring-0 font-bold text-primary text-xs uppercase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-white/40 backdrop-blur-[100px] bg-white/95 dark:bg-zinc-950/95">
                <SelectItem value="auto" className="rounded-xl font-bold text-xs">ระบบอัตโนมัติ</SelectItem>
                {availableModels.map(m => (
                  <SelectItem key={m.modelDbId} value={m.modelId} className="rounded-xl font-bold text-xs">
                    <span className="flex items-center gap-2">
                      <span className="font-black uppercase text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{m.platform}</span>
                      <span className="truncate max-w-[100px]">{m.displayName}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-destructive hover:bg-destructive/10 rounded-full px-3 font-black text-[9px] h-7">
                Reset
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 flex flex-col rounded-[2.5rem] border-4 border-white/60 bg-white/10 dark:bg-black/40 backdrop-blur-[100px] overflow-hidden min-h-0 shadow-2xl relative">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center animate-in fade-in zoom-in duration-700">
              <div className="space-y-6 max-w-sm">
                <div className="relative size-24 mx-auto group/icon">
                   <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-accent rounded-3xl blur-2xl opacity-40 animate-aura" />
                   <div className="relative size-24 bg-white rounded-3xl flex items-center justify-center shadow-xl border-2 border-primary/10">
                     <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>
                   </div>
                </div>
                <div>
                  <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent bg-[length:200%_auto] animate-gradient leading-none tracking-tighter">
                    สสจ.มุกดาหาร AI
                  </h2>
                  <p className="text-[10px] font-black text-primary mt-3 uppercase tracking-[0.3em]">
                    Active: {activeModelLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                  <div
                    className={`max-w-[85%] rounded-[1.75rem] px-5 py-3 text-sm leading-relaxed shadow-lg border-2 backdrop-blur-2xl transition-all ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground border-white/20 rounded-tr-none shadow-primary/20'
                        : 'bg-white/95 dark:bg-zinc-950/95 text-foreground border-white/80 dark:border-zinc-800 rounded-tl-none shadow-black/5'
                    }`}
                  >
                    {Array.isArray(msg.content) ? (
                      <div className="space-y-4">
                        {msg.content.map((part, pi) => {
                          if (part.type === 'text') return <div key={pi} className="whitespace-pre-wrap font-bold tracking-tight">{part.text}</div>
                          if (part.type === 'image_url') return (
                            <div key={pi} className="relative group/img overflow-hidden rounded-2xl border-4 border-white shadow-lg">
                              <img src={part.image_url.url} className="max-w-full" alt="" />
                            </div>
                          )
                          if (part.type === 'file') return (
                            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-2xl border-2 border-white/40 text-xs font-black shadow-inner">
                              <div className="size-10 bg-white text-primary rounded-xl flex items-center justify-center shadow-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                              </div>
                              <div className="flex flex-col">
                                <span className="truncate max-w-[150px] text-sm">{part.file.name}</span>
                                <span className="text-[8px] opacity-60 uppercase tracking-widest">{part.file.mimeType}</span>
                              </div>
                            </div>
                          )
                          return null
                        })}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap font-bold tracking-tight">{msg.content}</div>
                    )}
                    {msg.meta && (
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-black/5 dark:border-white/5 text-[9px] font-black uppercase tracking-widest opacity-40">
                        <span>{msg.meta.platform}</span>
                        <span>·</span>
                        <span className="text-primary">{msg.meta.latency} ms</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start animate-in fade-in duration-300">
                  <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl border-2 border-white rounded-[1.75rem] rounded-tl-none px-5 py-3 shadow-lg">
                    <div className="flex gap-2">
                      <div className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="size-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="size-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="p-5 bg-white/60 dark:bg-black/80 backdrop-blur-[120px] border-t-4 border-white/60 relative z-20">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-4 mb-5 p-4 bg-white/30 rounded-[2rem] border-4 border-dashed border-white/60 shadow-inner relative group/att-container overflow-hidden">
              {attachments.map((att, i) => (
                <div key={i} className="relative group/att animate-in zoom-in-75 duration-300">
                  {att.type === 'image' ? (
                    <img src={att.data} className="size-20 object-cover rounded-2xl border-4 border-white shadow-xl transition-all" alt="" />
                  ) : (
                    <div className="size-20 flex flex-col items-center justify-center bg-white rounded-2xl border-4 border-white shadow-xl text-[8px] font-black p-3 text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mb-2 text-primary"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="truncate w-full">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-2 -right-2 size-8 bg-destructive text-white rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-100 transition-all hover:bg-red-600 z-20"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex gap-4 items-end max-w-4xl mx-auto">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/*,.pdf,.txt" />
            
            <div className="flex gap-2 shrink-0 mb-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-2xl bg-white border-2 border-white shadow-xl transition-all active:scale-90 hover:bg-primary hover:text-white"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`size-11 rounded-2xl border-2 border-white shadow-xl transition-all active:scale-90 ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-white hover:bg-primary hover:text-white'}`}
                onClick={handleVoiceInput}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              </Button>
            </div>

            <div className="flex-1 relative group/input">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="คุยกับ AI อัจฉริยะ..."
                rows={1}
                className="relative w-full resize-none rounded-2xl border-2 border-white bg-white/95 dark:bg-zinc-950/95 px-6 py-3.5 text-[15px] font-bold focus:outline-none focus:border-primary shadow-xl transition-all min-h-[50px] max-h-[250px] placeholder:opacity-30 tracking-tight"
                style={{ height: 'auto', overflow: 'hidden' }}
                onInput={e => {
                  const el = e.target as HTMLTextAreaElement
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 250) + 'px'
                }}
              />
            </div>

            <Button 
              onClick={handleSend} 
              disabled={loading || (!input.trim() && attachments.length === 0)} 
              size="lg"
              className="h-[50px] px-8 rounded-2xl bg-gradient-to-br from-primary via-primary to-secondary hover:scale-105 active:scale-95 shadow-xl transition-all font-black text-white shrink-0 group/send border-2 border-white/20"
            >
              {loading ? (
                <span className="size-6 border-4 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <div className="flex items-center gap-2 text-sm uppercase tracking-tighter font-black">
                  <span>SEND</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="group-hover:send:translate-x-1 transition-transform"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </div>
              )}
            </Button>
          </div>
          <p className="text-[8px] text-center text-primary font-black mt-3 uppercase tracking-[0.4em] opacity-30">
            Intelligent AI Support · Port 3001
          </p>
        </div>
      </div>
    </div>
  )
}

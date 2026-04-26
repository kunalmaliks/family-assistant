"use client"

import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Send, Loader2, CalendarPlus, Check, X, RefreshCw, Mic } from "lucide-react"
import { cn, formatTime12 } from "@/lib/utils"
import ReactMarkdown from "react-markdown"

const QUICK_ACTIONS = [
  "What's new?",
  "Upcoming payments?",
  "School updates?",
  "Any appointments?",
  "Vacation plans?",
]

interface CalendarSuggestion {
  title: string
  date: string
  time?: string
  end_date?: string
  end_time?: string
  location?: string
  description?: string
  recurrence?: string
  recurrence_label?: string
  _duplicate?: string
}

interface CalendarEdit {
  event_id: string
  summary: string
  title?: string
  date?: string
  time?: string
  end_date?: string
  end_time?: string
  location?: string
  description?: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  calendarSuggestions?: CalendarSuggestion[]
  calendarEdit?: CalendarEdit
}

export default function ChatPage() {
  const { data: session } = useSession()
  const WELCOME: Message = {
    id: "welcome",
    role: "assistant",
    content: "Hi! I'm your family assistant. Ask me about emails, upcoming events, payments, school updates, or anything on your family's plate.",
    timestamp: new Date(),
  }

  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [addingEventId, setAddingEventId] = useState<string | null>(null)
  const [addedEventIds, setAddedEventIds] = useState<Set<string>>(new Set())
  // For multiple suggestions per message, track by "msgId-index"

  const [isListening, setIsListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load persisted chat history on mount
  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          setMessages(
            data.messages.map((m: { id: string; role: "user" | "assistant"; message: string; timestamp: string }) => ({
              id: m.id,
              role: m.role,
              content: m.message,
              timestamp: new Date(m.timestamp),
            }))
          )
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      })
      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response || "Sorry, I couldn't get a response. Please try again.",
          timestamp: new Date(),
          calendarSuggestions: data.calendarSuggestions?.length ? data.calendarSuggestions : undefined,
          calendarEdit: data.calendarEdit ?? undefined,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function saveNote(message: string) {
    await fetch("/api/chat/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    })
  }

  async function applyEdit(msgId: string, edit: CalendarEdit) {
    setAddingEventId(msgId)
    try {
      const res = await fetch(`/api/calendar/${edit.event_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      })
      if (res.ok) {
        setAddedEventIds((prev) => new Set(prev).add(msgId))
        await saveNote(`✓ Calendar event updated: ${edit.summary}`)
      }
    } finally {
      setAddingEventId(null)
    }
  }

  async function addToCalendar(key: string, suggestion: CalendarSuggestion, force = false) {
    setAddingEventId(key)
    try {
      const res = await fetch(`/api/calendar${force ? "?force=true" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...suggestion, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      })
      if (res.status === 409) {
        const data = await res.json()
        setMessages((prev) => prev.map((m) => {
          if (!m.calendarSuggestions) return m
          return {
            ...m,
            calendarSuggestions: m.calendarSuggestions.map((s, i) =>
              `${m.id}-${i}` === key ? { ...s, _duplicate: data.existingEventTitle } : s
            ),
          }
        }))
        return
      }
      if (res.ok) {
        setAddedEventIds((prev) => new Set(prev).add(key))
        const label = suggestion.recurrence_label ? ` (${suggestion.recurrence_label})` : ""
        await saveNote(`✓ Calendar event added: ${suggestion.title} on ${suggestion.date}${suggestion.time ? ` at ${suggestion.time}` : ""}${label}`)
      }
    } finally {
      setAddingEventId(null)
    }
  }

  function toggleVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert("Voice input is not supported in this browser. Try Chrome or Safari.")
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = "en-US"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      sendMessage(transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function formatEventDate(date: string, time?: string) {
    const d = new Date(date + "T00:00:00")
    if (isNaN(d.getTime())) return date
    const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    const t = formatTime12(time)
    return t ? `${dateStr} at ${t}` : dateStr
  }

  const firstName = session?.user?.name?.split(" ")[0] || "there"

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-zinc-950 border-b border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Hey {firstName} 👋</h1>
            <p className="text-zinc-500 text-xs">Family Assistant</p>
          </div>
          {session?.user?.image && (
            <img src={session.user.image} alt="avatar" className="w-9 h-9 rounded-full border-2 border-amber-500/30" />
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {historyLoading && (
          <div className="flex justify-center py-4">
            <div className="w-4 h-4 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-amber-500 text-black rounded-br-sm"
                  : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
              )}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                    li: ({ children }) => <li className="leading-snug">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-amber-400">{children}</strong>,
                    code: ({ children }) => <code className="bg-zinc-700 px-1 rounded text-xs">{children}</code>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>

            {/* Calendar edit card */}
            {msg.calendarEdit && (
              <div className="max-w-[80%] mt-1.5 bg-zinc-900 border border-amber-500/30 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <RefreshCw size={15} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-500 font-medium mb-0.5">Update Calendar Event?</p>
                    <p className="text-sm text-white">{msg.calendarEdit.summary}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {addedEventIds.has(msg.id) ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-500">
                      <Check size={13} /> Event updated
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => applyEdit(msg.id, msg.calendarEdit!)}
                        disabled={addingEventId === msg.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
                      >
                        {addingEventId === msg.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Yes, update it
                      </button>
                      <button
                        onClick={() => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, calendarEdit: undefined } : m))}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-xl transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Calendar suggestion cards */}
            {msg.calendarSuggestions?.map((suggestion, idx) => {
              const key = `${msg.id}-${idx}`
              return (
                <div key={key} className="max-w-[80%] mt-1.5 bg-zinc-900 border border-amber-500/30 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <CalendarPlus size={15} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-500 font-medium mb-0.5">Add to Calendar?</p>
                      <p className="text-sm text-white font-medium truncate">{suggestion.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {formatEventDate(suggestion.date, suggestion.time)}
                        {(suggestion.end_time || suggestion.end_date) && (
                          <> → {formatEventDate(suggestion.end_date || suggestion.date, suggestion.end_time)}</>
                        )}
                        {suggestion.location && ` · ${suggestion.location}`}
                      </p>
                      {suggestion.recurrence_label && (
                        <p className="flex items-center gap-1 text-xs text-amber-500/80 mt-1">
                          <RefreshCw size={10} />
                          {suggestion.recurrence_label}
                        </p>
                      )}
                    </div>
                  </div>
                  {suggestion._duplicate && (
                    <p className="text-xs text-orange-400 mt-2 leading-snug">
                      Already on your calendar as <strong className="text-orange-300">{suggestion._duplicate}</strong>. Add anyway?
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    {addedEventIds.has(key) ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-500">
                        <Check size={13} /> Added to Google Calendar
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => addToCalendar(key, suggestion, !!suggestion._duplicate)}
                          disabled={addingEventId === key}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
                        >
                          {addingEventId === key ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          {suggestion._duplicate ? "Add anyway" : "Yes, add it"}
                        </button>
                        <button
                          onClick={() =>
                            setMessages((prev) =>
                              prev.map((m) => m.id === msg.id ? {
                                ...m,
                                calendarSuggestions: m.calendarSuggestions?.filter((_, i) => i !== idx)
                              } : m)
                            )
                          }
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-xl transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick action chips */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => sendMessage(action)}
              disabled={loading}
              className="shrink-0 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs rounded-full border border-zinc-700 transition-colors disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-3">
        <div className="flex items-end gap-2 bg-zinc-800 rounded-2xl px-4 py-2.5 border border-zinc-700 focus-within:border-amber-500/50 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your family..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 resize-none outline-none max-h-32 leading-relaxed"
            style={{ minHeight: "24px" }}
          />
          <button
            onClick={toggleVoice}
            disabled={loading}
            className={cn(
              "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
              isListening ? "bg-red-500 text-white animate-pulse" : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Mic size={14} />
          </button>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className={cn(
              "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
              input.trim() && !loading ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-zinc-700 text-zinc-500"
            )}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Bell, CalendarCheck, AlertTriangle, X, Loader2, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  type: "auto_event" | "duplicate" | "daily_brief" | "review"
  title: string
  body: string
  calendar_event_id?: string
  event_date?: string
  created_at: string
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const TYPE_CONFIG = {
  auto_event: { icon: CalendarCheck, color: "text-green-400", bg: "bg-green-500/10", label: "Event Added" },
  duplicate: { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", label: "Duplicate Detected" },
  daily_brief: { icon: Bell, color: "text-amber-400", bg: "bg-amber-500/10", label: "Daily Brief" },
  review: { icon: ClipboardList, color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Review Needed" },
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function dismiss(id: string) {
    setDismissingId(id)
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" })
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } finally {
      setDismissingId(null)
    }
  }

  async function dismissAll() {
    const ids = notifications.map((n) => n.id)
    await Promise.all(ids.map((id) => fetch(`/api/notifications/${id}`, { method: "PATCH" })))
    setNotifications([])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-lg mx-auto">
      <div className="px-4 pt-4 pb-3 bg-zinc-950 border-b border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Alerts</h1>
            <p className="text-zinc-500 text-xs">
              {notifications.length > 0 ? `${notifications.length} unread` : "All caught up"}
            </p>
          </div>
          {notifications.length > 0 && (
            <button
              onClick={dismissAll}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Dismiss all
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-amber-500 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <Bell size={28} className="text-zinc-500" />
            </div>
            <p className="text-zinc-400 font-medium">No alerts</p>
            <p className="text-zinc-600 text-sm mt-1">You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.daily_brief
              const Icon = cfg.icon
              return (
                <div
                  key={n.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5", cfg.bg)}>
                      <Icon size={16} className={cfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", cfg.color)}>
                            {cfg.label}
                          </span>
                          <p className="text-sm text-white font-medium leading-snug mt-0.5">{n.title}</p>
                        </div>
                        <button
                          onClick={() => dismiss(n.id)}
                          disabled={dismissingId === n.id}
                          className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors mt-0.5"
                        >
                          {dismissingId === n.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <X size={14} />
                          )}
                        </button>
                      </div>
                      {n.body && (
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{n.body}</p>
                      )}
                      <p className="text-[10px] text-zinc-600 mt-1.5">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

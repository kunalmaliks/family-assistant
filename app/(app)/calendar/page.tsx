"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, Clock, MapPin, Pencil, Trash2, X, Check, Loader2 } from "lucide-react"
import { cn, formatTime12 } from "@/lib/utils"
import type { CalendarEvent } from "@/lib/calendar"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]

function buildGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

interface EditForm {
  title: string
  date: string
  time: string
  end_date: string
  end_time: string
  location: string
  description: string
}

export default function CalendarPage() {
  const today = new Date()
  const [monthOffset, setMonthOffset] = useState(0)
  const [monthsAhead, setMonthsAhead] = useState(4)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(
    toDateStr(today.getFullYear(), today.getMonth(), today.getDate())
  )
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const displayYear = new Date(today.getFullYear(), today.getMonth() + monthOffset).getFullYear()
  const displayMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset).getMonth()
  const maxOffset = monthsAhead

  useEffect(() => {
    fetchEvents()
  }, [monthsAhead])

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const m = d.settings?.notification_preferences?.calendar_months_ahead
        if (m) setMonthsAhead(m)
      })
      .catch(() => {})
  }, [])

  async function fetchEvents() {
    setLoading(true)
    try {
      const res = await fetch(`/api/calendar?months=${monthsAhead}`)
      const data = await res.json()
      setEvents(data.events || [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  function openEdit(event: CalendarEvent) {
    setEditingEvent(event)
    setEditForm({
      title: event.title,
      date: event.date,
      time: event.time || "",
      end_date: event.end_date || event.date,
      end_time: event.end_time || "",
      location: event.location || "",
      description: event.description || "",
    })
  }

  async function saveEdit() {
    if (!editingEvent || !editForm) return
    setSaving(true)
    try {
      const res = await fetch(`/api/calendar/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          date: editForm.date,
          time: editForm.time || undefined,
          end_date: editForm.end_date || undefined,
          end_time: editForm.end_time || undefined,
          location: editForm.location || undefined,
          description: editForm.description || undefined,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      if (res.ok) {
        setEditingEvent(null)
        setEditForm(null)
        fetchEvents()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || "Failed to update event. Please try again.")
      }
    } catch {
      alert("Failed to update event. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(eventId: string) {
    setDeletingId(eventId)
    try {
      const res = await fetch(`/api/calendar/${eventId}`, { method: "DELETE" })
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== eventId))
      }
    } finally {
      setDeletingId(null)
    }
  }

  const grid = buildGrid(displayYear, displayMonth)
  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = []
    acc[e.date].push(e)
    return acc
  }, {})

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-zinc-800/50">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMonthOffset((o) => Math.max(0, o - 1))}
            disabled={monthOffset === 0}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-base font-semibold text-white">
            {MONTH_NAMES[displayMonth]} {displayYear}
          </h2>
          <button
            onClick={() => setMonthOffset((o) => Math.min(maxOffset, o + 1))}
            disabled={monthOffset === maxOffset}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex gap-1 mt-2">
          {Array.from({ length: maxOffset + 1 }, (_, i) => {
            const d = new Date(today.getFullYear(), today.getMonth() + i)
            return (
              <button
                key={i}
                onClick={() => setMonthOffset(i)}
                className={cn(
                  "flex-1 py-1 text-xs rounded-lg transition-colors",
                  monthOffset === i ? "bg-amber-500 text-black font-medium" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {MONTH_NAMES[d.getMonth()].slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="px-3 pt-3">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-zinc-600 py-1">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px">
            {grid.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />
              const dateStr = toDateStr(displayYear, displayMonth, day)
              const dayEvents = eventsByDate[dateStr] || []
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={cn(
                    "relative flex flex-col items-center py-1.5 rounded-xl transition-colors",
                    isSelected ? "bg-amber-500" : isToday ? "bg-zinc-800" : "hover:bg-zinc-900"
                  )}
                >
                  <span className={cn(
                    "text-sm font-medium",
                    isSelected ? "text-black" : isToday ? "text-amber-500" : "text-zinc-300"
                  )}>
                    {day}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-[28px]">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div key={e.id} className={cn("w-1 h-1 rounded-full", isSelected ? "bg-black/50" : "bg-amber-500")} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected day events */}
      <div className="flex-1 px-4 pt-4 pb-4">
        {selectedDate && (
          <>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric",
              })}
            </p>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-zinc-600 text-center py-6">No events</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="bg-zinc-900 rounded-xl px-4 py-3 border border-zinc-800/50">
                    <div className="flex items-start gap-3">
                      <div className="w-1 self-stretch rounded-full shrink-0 bg-amber-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{event.title}</p>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {event.time && (
                            <span className="flex items-center gap-1 text-xs text-zinc-500">
                              <Clock size={11} />
                              {formatTime12(event.time)}{event.end_time ? ` – ${formatTime12(event.end_time)}` : ""}
                            </span>
                          )}
                          {event.location && (
                            <span className="flex items-center gap-1 text-xs text-zinc-500">
                              <MapPin size={11} />{event.location}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{event.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(event)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteEvent(event.id)}
                          disabled={deletingId === event.id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                        >
                          {deletingId === event.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {!selectedDate && !loading && (
          <p className="text-xs text-zinc-600 text-center pt-4">Tap a day to see events</p>
        )}
      </div>

      {/* Edit modal */}
      {editingEvent && editForm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={() => { setEditingEvent(null); setEditForm(null) }}>
          <div
            className="w-full max-w-lg bg-zinc-900 rounded-t-2xl border-t border-zinc-800 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
              <h3 className="text-sm font-semibold text-white">Edit Event</h3>
              <button onClick={() => { setEditingEvent(null); setEditForm(null) }} className="text-zinc-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-2 space-y-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Title</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-700 focus:border-amber-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Start date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-700 focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Start time</label>
                  <input
                    type="time"
                    value={editForm.time}
                    onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                    className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-700 focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">End date</label>
                  <input
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                    className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-700 focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">End time</label>
                  <input
                    type="time"
                    value={editForm.end_time}
                    onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                    className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-700 focus:border-amber-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Location</label>
                <input
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-700 focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-700 focus:border-amber-500/50 resize-none"
                />
              </div>
            </div>

            <div className="px-4 pt-2 pb-8 shrink-0">
              <button
                onClick={saveEdit}
                disabled={saving || !editForm.title}
                className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-medium text-sm rounded-xl transition-colors"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

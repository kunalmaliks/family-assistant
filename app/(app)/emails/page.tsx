"use client"

import { useState, useEffect } from "react"
import { Paperclip, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Email, Category, CategoryRule } from "@/lib/supabase"

const CATEGORIES: Category[] = ["School", "Payments", "Travel", "Activities", "Other"]
const ALL_FILTERS = ["All", ...CATEGORIES]

const CATEGORY_COLORS: Record<Category, string> = {
  School: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Payments: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Travel: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Activities: "bg-green-500/20 text-green-400 border-green-500/30",
  Other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("All")
  const [ruleFilter, setRuleFilter] = useState<string | null>(null)
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [recategorizing, setRecategorizing] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/settings/rules").then(r => r.json()).then(d => setRules(d.rules || []))
  }, [])

  useEffect(() => {
    fetchEmails()
  }, [filter, ruleFilter])

  async function fetchEmails() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== "All") params.set("category", filter)
      if (ruleFilter) params.set("rule_id", ruleFilter)
      const res = await fetch(`/api/emails${params.size ? "?" + params : ""}`)
      const data = await res.json()
      setEmails(data.emails || [])
    } catch {
      setEmails([])
    } finally {
      setLoading(false)
    }
  }

  function selectRule(ruleId: string) {
    setRuleFilter(prev => prev === ruleId ? null : ruleId)
    setFilter("All")
  }

  function selectCategory(cat: string) {
    setFilter(cat)
    setRuleFilter(null)
  }


  async function recategorize(emailId: string, newCategory: Category) {
    setRecategorizing(null)
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, category: newCategory } : e))
    )
    await fetch(`/api/emails/${emailId}/categorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCategory }),
    })
  }


  return (
    <div className="min-h-screen bg-zinc-950 max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-950 px-4 pt-4 pb-2 border-b border-zinc-800/50">
        <h1 className="text-lg font-semibold text-white mb-3">Emails</h1>

        {/* Category filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {ALL_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => selectCategory(cat)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                filter === cat && !ruleFilter
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Rule filter pills */}
        {rules.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mt-2 scrollbar-hide">
            {rules.map((rule) => (
              <button
                key={rule.id}
                onClick={() => selectRule(rule.id)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                  ruleFilter === rule.id
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-600"
                )}
              >
                {rule.rule_value}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Email list */}
      <div className="px-4 py-3 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-800 rounded w-1/2" />
                  <div className="h-3 bg-zinc-800 rounded w-full" />
                </div>
              </div>
            </div>
          ))
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-zinc-400 font-medium">No emails yet</p>
            <p className="text-zinc-600 text-sm mt-1">
              Tap Sync to pull in your latest emails
            </p>
          </div>
        ) : (
          emails.map((email) => (
            <div
              key={email.id}
              className="bg-zinc-900 rounded-xl p-4 border border-zinc-800/50 relative"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-300 shrink-0">
                  {email.sender.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs text-zinc-500 truncate">{email.sender}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {email.has_attachment && <Paperclip size={12} className="text-zinc-500" />}
                      <span className="text-[10px] text-zinc-600">
                        {new Date(email.date_received).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-white truncate mb-1.5">{email.subject}</p>
                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                    {email.body}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    {/* Category badge with recategorize dropdown */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setRecategorizing(recategorizing === email.id ? null : email.id)
                        }
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                          CATEGORY_COLORS[email.category]
                        )}
                      >
                        {email.category}
                        <ChevronDown size={10} />
                      </button>

                      {recategorizing === email.id && (
                        <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-20 py-1 min-w-[130px]">
                          {CATEGORIES.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => recategorize(email.id, cat)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                            >
                              {email.category === cat && <Check size={12} className="text-amber-500" />}
                              <span className={email.category === cat ? "text-amber-500" : ""}>{cat}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

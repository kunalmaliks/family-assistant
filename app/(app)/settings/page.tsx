"use client"

import { useState, useEffect } from "react"
import { signOut, useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Trash2, LogOut, RefreshCw, X, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CategoryRule } from "@/lib/supabase"

const CATEGORY_COLORS: Record<string, string> = {
  School: "text-blue-400",
  Payments: "text-amber-400",
  Travel: "text-purple-400",
  Events: "text-green-400",
  Other: "text-zinc-400",
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [syncBanner, setSyncBanner] = useState<"syncing" | null>(null)
  const [syncingRuleId, setSyncingRuleId] = useState<string | null>(null)
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [monthsAhead, setMonthsAhead] = useState(2)
  const [syncFrequency, setSyncFrequency] = useState("30min")
  const [lookbackPeriod, setLookbackPeriod] = useState("1month")
  const [savingMonths, setSavingMonths] = useState(false)
  const [savingSync, setSavingSync] = useState(false)

  useEffect(() => {
    fetchRules()
    fetchSettings()
    if (searchParams.get("syncing") === "true") {
      setSyncBanner("syncing")
      router.replace("/settings")
    }
  }, [])

  async function fetchRules() {
    try {
      const res = await fetch("/api/settings/rules")
      const data = await res.json()
      setRules(data.rules || [])
    } catch {}
  }

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings")
      const data = await res.json()
      const s = data.settings
      if (s?.notification_preferences?.calendar_months_ahead) setMonthsAhead(s.notification_preferences.calendar_months_ahead)
      if (s?.sync_frequency) setSyncFrequency(s.sync_frequency)
      if (s?.lookback_period) setLookbackPeriod(s.lookback_period)
    } catch {}
  }

  async function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id))
    await fetch(`/api/settings/rules/${id}`, { method: "DELETE" })
  }

  async function syncRule(ruleId: string) {
    setSyncingRuleId(ruleId)
    setSyncBanner("syncing")
    await fetch("/api/emails/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_id: ruleId }),
    })
    setSyncingRuleId(null)
  }

  async function syncAll() {
    setSyncingRuleId("all")
    setSyncBanner("syncing")
    await fetch("/api/emails/sync", { method: "POST" })
    setSyncingRuleId(null)
  }

  async function saveSettings(patch: { sync_frequency?: string; lookback_period?: string; calendar_months_ahead?: number }) {
    const newFreq = patch.sync_frequency ?? syncFrequency
    const newLookback = patch.lookback_period ?? lookbackPeriod
    const newMonths = patch.calendar_months_ahead ?? monthsAhead
    if (patch.sync_frequency) setSyncFrequency(newFreq)
    if (patch.lookback_period) setLookbackPeriod(newLookback)
    if (patch.calendar_months_ahead) setMonthsAhead(newMonths)
    setSavingSync(true)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sync_frequency: newFreq,
          lookback_period: newLookback,
          notification_preferences: { calendar_months_ahead: newMonths },
        }),
      })
    } finally {
      setSavingSync(false)
      setSavingMonths(false)
    }
  }

  async function saveMonthsAhead(months: number) {
    setSavingMonths(true)
    await saveSettings({ calendar_months_ahead: months })
  }

  const ruleTypeLabel: Record<string, string> = { sender: "Sender", domain: "Domain", keyword: "Keyword" }

  return (
    <div className="min-h-screen bg-zinc-950 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800/50">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">Settings</h1>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
        {session?.user && (
          <p className="text-xs text-zinc-600 mt-0.5">{session.user.email}</p>
        )}
      </div>

      {syncBanner && (
        <div className="mx-4 mt-3 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <RefreshCw size={14} className="text-amber-500 animate-spin shrink-0" />
          <p className="text-xs text-amber-400 flex-1">Sync running in background — new emails will appear in the Emails tab shortly.</p>
          <button onClick={() => setSyncBanner(null)} className="text-zinc-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="px-4 py-4 space-y-6">
        {/* Section 1: Email Rules */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Email Rules</h2>
            <div className="flex items-center gap-3">
              {rules.length > 0 && (
                <button
                  onClick={syncAll}
                  disabled={syncingRuleId !== null}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-500 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={12} className={cn(syncingRuleId === "all" && "animate-spin")} />
                  Sync All
                </button>
              )}
              <button
                onClick={() => router.push("/settings/add-rule")}
                className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors font-medium"
              >
                <Plus size={13} />
                Add Rule
              </button>
            </div>
          </div>

          {rules.length === 0 ? (
            <div className="bg-zinc-900 rounded-xl px-4 py-6 text-center">
              <p className="text-zinc-500 text-sm">No rules yet</p>
              <p className="text-zinc-600 text-xs mt-1">Add rules to control which emails get synced</p>
              <button
                onClick={() => router.push("/settings/add-rule")}
                className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-amber-500 hover:text-amber-400 font-medium transition-colors"
              >
                <Plus size={13} />
                Add your first rule
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[72px_1fr_76px_64px] px-4 py-2 border-b border-zinc-800">
                <span className="text-[11px] font-medium text-zinc-500">Type</span>
                <span className="text-[11px] font-medium text-zinc-500">Match</span>
                <span className="text-[11px] font-medium text-zinc-500">Category</span>
                <span />
              </div>

              {/* Rows */}
              {rules.map((rule, i) => (
                <div
                  key={rule.id}
                  className={cn(
                    "grid grid-cols-[72px_1fr_76px_64px] items-center px-4 py-3",
                    i < rules.length - 1 && "border-b border-zinc-800/50"
                  )}
                >
                  <span className="text-xs text-zinc-400">{ruleTypeLabel[rule.rule_type] || rule.rule_type}</span>
                  <span className="text-xs text-white truncate pr-2">{rule.rule_value}</span>
                  <span className={cn("text-xs font-medium", CATEGORY_COLORS[rule.category] || "text-zinc-400")}>
                    {rule.category}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => syncRule(rule.id)}
                      disabled={syncingRuleId !== null}
                      title="Sync emails matching this rule"
                      className="text-zinc-600 hover:text-amber-500 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={13} className={cn(syncingRuleId === rule.id && "animate-spin text-amber-500")} />
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      title="Deleting this rule stops future syncs for matching emails. Already synced emails are not affected."
                      className="text-zinc-700 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Sync Frequency */}
        <section>
          <h2 className="text-sm font-semibold text-white mb-3">Email Sync</h2>
          <div className="bg-zinc-900 rounded-xl p-4 space-y-4">
            <div>
              <p className="text-sm text-zinc-300 mb-1">Sync frequency</p>
              <p className="text-xs text-zinc-500 mb-3">How often new emails are fetched from Gmail. Applies to all rules.</p>
              <div className="flex gap-2">
                {[
                  { value: "30min", label: "30 min" },
                  { value: "1hour", label: "1 hour" },
                  { value: "2hour", label: "2 hours" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => saveSettings({ sync_frequency: opt.value })}
                    disabled={savingSync}
                    className={cn(
                      "flex-1 py-2 text-xs rounded-xl border font-medium transition-all",
                      syncFrequency === opt.value
                        ? "bg-amber-500 text-black border-amber-500"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-zinc-300 mb-1">Lookback period</p>
              <p className="text-xs text-zinc-500 mb-3">How far back in Gmail to search on each sync. Increasing this will backfill older emails on the next sync.</p>
              <div className="flex gap-2">
                {[
                  { value: "1month", label: "1 month" },
                  { value: "3months", label: "3 months" },
                  { value: "6months", label: "6 months" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => saveSettings({ lookback_period: opt.value })}
                    disabled={savingSync}
                    className={cn(
                      "flex-1 py-2 text-xs rounded-xl border font-medium transition-all",
                      lookbackPeriod === opt.value
                        ? "bg-amber-500 text-black border-amber-500"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Calendar */}
        <section>
          <h2 className="text-sm font-semibold text-white mb-3">Calendar</h2>
          <div className="bg-zinc-900 rounded-xl p-4">
            <p className="text-sm text-zinc-300 mb-1">Months to display</p>
            <p className="text-xs text-zinc-500 mb-3">
              Shows current month + this many months ahead
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 6].map((m) => (
                <button
                  key={m}
                  onClick={() => saveMonthsAhead(m)}
                  disabled={savingMonths}
                  className={cn(
                    "flex-1 py-2 text-xs rounded-xl border font-medium transition-all",
                    monthsAhead === m
                      ? "bg-amber-500 text-black border-amber-500"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 mt-2 text-center">
              Currently showing {monthsAhead + 1} month{monthsAhead + 1 > 1 ? "s" : ""}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

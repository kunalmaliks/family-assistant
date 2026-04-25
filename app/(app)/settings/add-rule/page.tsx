"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Category } from "@/lib/supabase"

const CATEGORIES: Category[] = ["School", "Payments", "Travel", "Activities", "Other"]

export default function AddRulePage() {
  const router = useRouter()
  const [ruleType, setRuleType] = useState<"sender" | "domain" | "keyword">("domain")
  const [ruleValue, setRuleValue] = useState("")
  const [category, setCategory] = useState<Category>("School")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!ruleValue.trim()) return
    setSaving(true)
    setError(null)
    try {
      // Save rule
      const ruleRes = await fetch("/api/settings/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_type: ruleType, rule_value: ruleValue.trim(), category }),
      })
      if (!ruleRes.ok) {
        const d = await ruleRes.json()
        setError(d.error || "Failed to save rule")
        return
      }

      const { rule } = await ruleRes.json()
      fetch("/api/emails/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_id: rule.id }),
      })
      router.push("/settings?syncing=true")
    } catch {
      setError("Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const placeholder =
    ruleType === "domain" ? "e.g. @konstella.com" :
    ruleType === "sender" ? "e.g. principal@school.edu" :
    "e.g. invoice"

  return (
    <div className="min-h-screen bg-zinc-950 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800/50 flex items-center gap-3">
        <button
          onClick={() => router.push("/settings")}
          className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-base font-semibold text-white">Add Rule</h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Rule type */}
        <section>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Rule Type</p>
          <div className="flex gap-2">
            {(["domain", "sender", "keyword"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRuleType(t)}
                className={cn(
                  "flex-1 py-2.5 text-xs rounded-xl border capitalize font-medium transition-all",
                  ruleType === t
                    ? "bg-amber-500 text-black border-amber-500"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Match value */}
        <section>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Match</p>
          <input
            type="text"
            value={ruleValue}
            onChange={(e) => setRuleValue(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-zinc-900 text-sm text-white rounded-xl px-4 py-3 outline-none border border-zinc-800 focus:border-amber-500/50 placeholder-zinc-600 transition-colors"
          />
        </section>

        {/* Category */}
        <section>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Category</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "py-2.5 text-xs rounded-xl border font-medium transition-all",
                  category === c
                    ? "bg-amber-500 text-black border-amber-500"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Save button */}
        <button
          onClick={save}
          disabled={!ruleValue.trim() || saving}
          className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded-2xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            <Check size={16} />
          )}
          {saving ? "Saving..." : "Save Rule"}
        </button>
      </div>
    </div>
  )
}

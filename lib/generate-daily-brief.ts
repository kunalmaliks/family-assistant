import Anthropic from "@anthropic-ai/sdk"
import { fetchCalendarEvents } from "./calendar"
import { createSupabaseAdminClient } from "./supabase"

export async function generateDailyBrief(
  userId: string,
  accessToken: string,
  refreshToken: string | null,
  timezone?: string
): Promise<void> {
  const supabase = createSupabaseAdminClient()

  // Skip if a brief was already posted today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "daily_brief")
    .gte("created_at", todayStart.toISOString())
    .limit(1)

  if (existing && existing.length > 0) return

  const today = new Date().toISOString().split("T")[0]

  // Fetch today's calendar events (next 1 day)
  let todayEvents: Awaited<ReturnType<typeof fetchCalendarEvents>> = []
  try {
    const events = await fetchCalendarEvents(accessToken, refreshToken, 1, timezone)
    todayEvents = events.filter((e) => e.date === today)
  } catch (e) {
    console.error("[daily-brief] calendar fetch failed:", e)
  }

  // Fetch emails from last 24 hours (by date_received — actual send date)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentEmails } = await supabase
    .from("emails")
    .select("subject, sender, category, date_received")
    .gte("date_received", since)
    .order("date_received", { ascending: false })
    .limit(20)

  const calendarSection = todayEvents.length > 0
    ? todayEvents.map((e) => {
        const time = e.time ? ` at ${e.time}${e.end_time ? `–${e.end_time}` : ""}` : ""
        const loc = e.location ? ` @ ${e.location}` : ""
        return `• ${e.title}${time}${loc}`
      }).join("\n")
    : "No events today."

  const emailSection = recentEmails && recentEmails.length > 0
    ? recentEmails.map((e) => `• [${e.category}] ${e.subject} — from ${e.sender}`).join("\n")
    : "No new emails."

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Write a brief, friendly morning summary (3–5 sentences max) for a family assistant app. Today is ${today}.

Today's calendar:
${calendarSection}

Recent emails (last 24 hours):
${emailSection}

Highlight the most important things. Be concise and warm. No bullet points — write as a short paragraph.`
    }]
  })

  const briefText = response.content[0].type === "text" ? response.content[0].text.trim() : ""
  if (!briefText) return

  await supabase.from("notifications").insert({
    user_id: userId,
    type: "daily_brief",
    title: `Good morning · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
    body: briefText,
  })
}

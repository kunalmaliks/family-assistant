import { fetchCalendarEvents } from "./calendar"
import { createSupabaseAdminClient } from "./supabase"
import { generateText } from "./ai-provider"

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
    .select("id, subject, sender, category, date_received, body")
    .eq("user_id", userId)
    .gte("date_received", since)
    .order("date_received", { ascending: false })
    .limit(20)

  const attachmentsByEmail = new Map<string, string[]>()
  if (recentEmails && recentEmails.length > 0) {
    const { data: attachments } = await supabase
      .from("attachments")
      .select("email_id, text_content")
      .in("email_id", recentEmails.map((e) => e.id))
      .not("text_content", "is", null)
    for (const a of attachments || []) {
      if (!attachmentsByEmail.has(a.email_id)) attachmentsByEmail.set(a.email_id, [])
      attachmentsByEmail.get(a.email_id)!.push(a.text_content)
    }
  }

  const calendarSection = todayEvents.length > 0
    ? todayEvents.map((e) => {
        const time = e.time ? ` at ${e.time}${e.end_time ? `–${e.end_time}` : ""}` : ""
        const loc = e.location ? ` @ ${e.location}` : ""
        return `• ${e.title}${time}${loc}`
      }).join("\n")
    : "No events today."

  const emailSection = recentEmails && recentEmails.length > 0
    ? recentEmails.map((e) => {
        const attachmentText = (attachmentsByEmail.get(e.id) || []).join("\n").slice(0, 1200)
        return `---\n[${e.category}] ${e.subject} (from ${e.sender})\n${e.body.slice(0, 1200)}${attachmentText ? `\nAttachment content:\n${attachmentText}` : ""}`
      }).join("\n")
    : "No new emails."

  const prompt = `Write a morning brief for a family assistant app. Today is ${today}.

Today's calendar:
${calendarSection}

Recent emails (last 24 hours) — full content below, use it to pull out concrete details (specific dates, dollar amounts, deadlines, names, what action if any is needed):
${emailSection}

Write it as PLAIN TEXT (no markdown, no asterisks, no # headers) using this structure:
- One short warm opening line.
- If there are events today, a line "Today:" followed by each event on its own line starting with "• ".
- If there are emails worth flagging, a line "From your emails:" followed by one "• " bullet per key item. Each bullet must state the actual concrete detail from the email content — e.g. "Fire drill Sept 17, Back to School Assembly Sept 18 at 12:30pm (K-2), Curriculum Night Oct 8 5-6:30pm" — never a vague placeholder like "an email about school" or "some important emails to review". Combine closely related points from the same email into one bullet; use a separate bullet per distinct topic/email otherwise.
- Skip a section entirely if there's nothing to report in it.
- Keep each bullet to one line. Be concise overall.`

  const briefText = (await generateText(prompt, 800)).trim()
  if (!briefText) return

  await supabase.from("notifications").insert({
    user_id: userId,
    type: "daily_brief",
    title: `Good morning · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
    body: briefText,
  })
}

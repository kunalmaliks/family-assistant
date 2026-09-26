import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"
import { processEmailForCalendar } from "@/lib/process-email-calendar"
import { generateDailyBrief } from "@/lib/generate-daily-brief"
import { decryptToken } from "@/lib/token-crypto"

export async function POST() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const accessToken = session.accessToken
  if (!accessToken) {
    return NextResponse.json(
      { error: "No Google access token in session — please sign out and sign back in" },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "Could not resolve user" }, { status: 500 })

  const { data: userRow } = await supabase
    .from("users")
    .select("google_refresh_token")
    .eq("id", user.id)
    .single()
  const refreshToken = decryptToken(userRow?.google_refresh_token) || ""

  const { data: settings } = await supabase
    .from("settings")
    .select("timezone")
    .eq("user_id", user.id)
    .single()
  const timezone = settings?.timezone ?? undefined

  // Only rows where detection failed entirely (email_id set) are retryable —
  // low-confidence and calendar-insert-failure review notifications need
  // different retry semantics and aren't included here.
  const { data: failedNotifications } = await supabase
    .from("notifications")
    .select("id, email_id")
    .eq("user_id", user.id)
    .eq("type", "review")
    .eq("dismissed", false)
    .not("email_id", "is", null)

  let retried = 0
  for (const notif of failedNotifications || []) {
    const { data: email } = await supabase
      .from("emails")
      .select("id, subject, body, date_received")
      .eq("id", notif.email_id)
      .single()
    if (!email) continue

    const { data: attachments } = await supabase
      .from("attachments")
      .select("text_content")
      .eq("email_id", email.id)
      .not("text_content", "is", null)
    const attachmentText = (attachments || []).map((a) => a.text_content).filter(Boolean).join("\n")
    const combinedText = `${email.body}${attachmentText ? "\n" + attachmentText : ""}`

    // Dismiss the old failure notification before retrying — if it fails
    // again, processEmailForCalendar creates a fresh one in its place.
    await supabase.from("notifications").update({ dismissed: true }).eq("id", notif.id)

    await processEmailForCalendar(
      email.subject,
      combinedText,
      new Date(email.date_received).toISOString(),
      email.id,
      user.id,
      accessToken,
      refreshToken,
      timezone
    ).catch((e) => console.error("[retry-failed] error:", e))

    retried++
  }

  await generateDailyBrief(user.id, accessToken, refreshToken, timezone, true)
    .catch((e) => console.error("[retry-failed] daily brief error:", e))

  return NextResponse.json({ retried, dailyBriefRegenerated: true })
}

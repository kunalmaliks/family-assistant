import { google } from "googleapis"
import { detectCalendarEvents } from "./detect-calendar-events"
import { checkCalendarDuplicate } from "./duplicate-check"
import { createSupabaseAdminClient } from "./supabase"
import { normalizeTime } from "./utils"

export async function processEmailForCalendar(
  subject: string,
  body: string,
  emailDate: string,
  userId: string,
  accessToken: string,
  refreshToken: string | null,
  timezone = "America/Los_Angeles"
): Promise<void> {
  // Skip future-dated emails (data integrity guard)
  if (new Date(emailDate) > new Date()) return

  const emailDateOnly = emailDate.split("T")[0]
  const events = await detectCalendarEvents(subject, body, emailDateOnly)
  if (events.length === 0) return

  const supabase = createSupabaseAdminClient()

  const gAuth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  gAuth.setCredentials({ access_token: accessToken, refresh_token: refreshToken })
  const calendar = google.calendar({ version: "v3", auth: gAuth })
  const tz = timezone

  for (const event of events) {
    try {
      if (event.confidence === "low") {
        const timeStr = event.time ? ` at ${event.time}` : ""
        const locStr = event.location ? ` @ ${event.location}` : ""
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "review",
          title: event.title,
          body: `Possible appointment from "${subject}": ${event.date}${timeStr}${locStr}. ${event.low_confidence_reason ?? "Please review and add manually if correct."}`,
          event_date: event.date,
        })
        continue
      }

      // High confidence: check for duplicate first
      const dupCheck = await checkCalendarDuplicate(event.title, event.date, accessToken, refreshToken)

      if (dupCheck.isDuplicate) {
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "duplicate",
          title: `Duplicate detected: ${event.title}`,
          body: `Already on your calendar as "${dupCheck.existingEventTitle}". Found in email: "${subject}"`,
          event_date: event.date,
        })
        continue
      }

      // Create the event in Google Calendar
      const time = normalizeTime(event.time)
      const end_time = normalizeTime(event.end_time)

      // end_date is always the same as date — no multi-day spans, ever.
      // Recurring series end belongs in RRULE UNTIL, not here.
      const start = time
        ? { dateTime: `${event.date}T${time}:00`, timeZone: tz }
        : { date: event.date }

      const end = end_time
        ? { dateTime: `${event.date}T${end_time}:00`, timeZone: tz }
        : time
        ? { dateTime: `${event.date}T${time}:00`, timeZone: tz }
        : { date: event.date }

      const created = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: event.title,
          description: event.description,
          location: event.location,
          start,
          end,
          recurrence: event.recurrence ? [event.recurrence] : undefined,
          reminders: { useDefault: true },
        },
      })

      const timeStr = event.time ? ` at ${event.time}` : ""
      const recStr = event.recurrence_label ? ` · ${event.recurrence_label}` : ""

      await supabase.from("notifications").insert({
        user_id: userId,
        type: "auto_event",
        title: event.title,
        body: `Auto-added to Google Calendar from "${subject}". ${event.date}${timeStr}${recStr}`,
        calendar_event_id: created.data.id ?? null,
        event_date: event.date,
      })
    } catch (e) {
      console.error("[process-email-calendar] event failed:", event.title, e)
    }
  }
}

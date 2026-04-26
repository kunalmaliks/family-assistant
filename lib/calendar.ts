import { google } from "googleapis"

export interface CalendarEvent {
  id: string
  title: string
  date: string
  time?: string
  end_date?: string
  end_time?: string
  location?: string
  description?: string
  source: "google"
}

export async function fetchCalendarEvents(
  accessToken: string,
  refreshToken: string | null,
  monthsAhead = 2,
  timezone?: string
): Promise<CalendarEvent[]> {
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth(), 1)
  const timeMax = new Date(now.getFullYear(), now.getMonth() + monthsAhead + 1, 0, 23, 59, 59)

  const events: CalendarEvent[] = []

  try {
    const gAuth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    gAuth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    const calendar = google.calendar({ version: "v3", auth: gAuth })
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 500,
      timeZone: timezone || "America/Los_Angeles",
    })

    for (const event of res.data.items || []) {
      if (!event.id || event.status === "cancelled") continue
      const startRaw = event.start?.dateTime || event.start?.date || ""
      const date = startRaw.split("T")[0]
      const time = event.start?.dateTime
        ? event.start.dateTime.split("T")[1]?.substring(0, 5)
        : undefined

      const endRaw = event.end?.dateTime || event.end?.date || ""
      const end_date = endRaw ? endRaw.split("T")[0] : undefined
      const end_time = event.end?.dateTime
        ? event.end.dateTime.split("T")[1]?.substring(0, 5)
        : undefined

      events.push({
        id: event.id,
        title: event.summary || "Untitled",
        date,
        time,
        end_date,
        end_time,
        location: event.location ?? undefined,
        description: event.description ?? undefined,
        source: "google",
      })
    }
  } catch (e) {
    console.error("[calendar] Google fetch failed:", e)
  }

  events.sort((a, b) => {
    const aStr = a.time ? `${a.date}T${a.time}` : `${a.date}T00:00`
    const bStr = b.time ? `${b.date}T${b.time}` : `${b.date}T00:00`
    return aStr.localeCompare(bStr)
  })

  return events
}

export function formatEventsForContext(events: CalendarEvent[]): string {
  if (events.length === 0) return "No upcoming calendar events."
  return events
    .map((e) => {
      const dateStr = e.time ? `${e.date} at ${e.time}` : e.date
      const endStr = e.end_time ? `–${e.end_time}` : ""
      const loc = e.location ? ` @ ${e.location}` : ""
      const desc = e.description ? ` — ${e.description.slice(0, 100)}` : ""
      return `• [ID:${e.id}] ${e.title} (${dateStr}${endStr}${loc})${desc}`
    })
    .join("\n")
}

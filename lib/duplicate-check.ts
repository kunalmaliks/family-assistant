import { google } from "googleapis"
import Anthropic from "@anthropic-ai/sdk"

export interface DuplicateCheckResult {
  isDuplicate: boolean
  existingEventTitle?: string
  existingEventId?: string
}

export async function checkCalendarDuplicate(
  title: string,
  date: string,
  accessToken: string,
  refreshToken: string | null,
  timezone = "America/Los_Angeles"
): Promise<DuplicateCheckResult> {
  try {
    const gAuth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    gAuth.setCredentials({ access_token: accessToken, refresh_token: refreshToken })

    const calendar = google.calendar({ version: "v3", auth: gAuth })

    // Widen the UTC search window by a day on each side (safe for any timezone
    // offset up to ±14h), then filter by the zone-correct date Google returns
    // when timeZone is passed — mirrors the pattern in lib/calendar.ts.
    const dayStart = new Date(`${date}T00:00:00Z`)
    dayStart.setUTCDate(dayStart.getUTCDate() - 1)
    const dayEnd = new Date(`${date}T23:59:59Z`)
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      timeZone: timezone,
    })

    const existingEvents = (res.data.items || [])
      .filter((e) => {
        if (e.status === "cancelled" || !e.summary) return false
        const startRaw = e.start?.dateTime || e.start?.date || ""
        return startRaw.split("T")[0] === date
      })
      .map(e => ({ id: e.id!, title: e.summary! }))

    if (existingEvents.length === 0) return { isDuplicate: false }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Does any event in this list refer to the same appointment as "${title}"? Consider fuzzy matches, abbreviations, and different formats.

Existing events on ${date}:
${existingEvents.map((e, i) => `${i + 1}. ${e.title}`).join("\n")}

Reply with JSON only: {"isDuplicate": true/false, "matchIndex": <1-based index or null>}`
      }]
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { isDuplicate: false }

    const result = JSON.parse(jsonMatch[0])
    if (result.isDuplicate && result.matchIndex) {
      const match = existingEvents[result.matchIndex - 1]
      return { isDuplicate: true, existingEventTitle: match.title, existingEventId: match.id }
    }

    return { isDuplicate: false }
  } catch (e) {
    console.error("[duplicate-check] failed:", e)
    return { isDuplicate: false }
  }
}

import Anthropic from "@anthropic-ai/sdk"

export interface DetectedEvent {
  title: string
  date: string
  time?: string
  end_date?: string
  end_time?: string
  location?: string
  description?: string
  recurrence?: string
  recurrence_label?: string
  confidence: "high" | "low"
  low_confidence_reason?: string
}

export async function detectCalendarEvents(
  subject: string,
  body: string,
  emailDate: string
): Promise<DetectedEvent[]> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Extract appointments, events, or meetings from this email received on ${emailDate}.

Subject: ${subject}
Body: ${body.slice(0, 6000)}

Return a JSON array. Each item:
- title: string (event name)
- date: string (YYYY-MM-DD, first occurrence date)
- time: string (zero-padded 24h HH:MM e.g. "18:00" for 6pm, "09:00" for 9am — omit if all-day)
- end_date: string (YYYY-MM-DD — end of a SINGLE occurrence only, NOT the series end date)
- end_time: string (zero-padded 24h HH:MM — omit if all-day)
- location: string (if mentioned)
- description: string (max 100 chars)
- recurrence: string (RRULE — only if explicitly recurring; put the series end date in UNTIL, not in end_date)
- recurrence_label: string (e.g. "Every Tuesday through August 18, 2026")
- confidence: "high" if date+event clearly stated, "low" if uncertain/inferred
- low_confidence_reason: string (only when confidence is "low")

Rules:
- Only events with specific dates (skip vague references)
- RECURRING EVENTS — critical: when an event says "meets every [day] from [start] to [end]":
  * date = first occurrence (e.g. "2026-06-23")
  * end_date = end of THAT SAME first occurrence (same as date for a single-day event — do NOT set end_date to the last date in the series)
  * recurrence = RRULE with UNTIL= set to the last occurrence date in UTC (e.g. "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260818T235959Z")
  * Example: "Learn To Swim — meets every Tuesday from June 23 to Aug 18, 6:00–6:30pm" →
    { date: "2026-06-23", end_date: "2026-06-23", time: "18:00", end_time: "18:30", recurrence: "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260818T235959Z", recurrence_label: "Every Tuesday through August 18, 2026" }
- Skip events before ${emailDate}
- For flight itineraries: create one event per flight leg (e.g. "Flight LA2476: Lima → Los Angeles"), using the departure time as start time and arrival time as end time. Dates may be in DD/MM/YY format — convert to YYYY-MM-DD.
- Return [] if nothing found

JSON array only, no other text.`
      }]
    })

    const text = response.content[0].type === "text" ? response.content[0].text : "[]"
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []

    const events = JSON.parse(match[0]) as DetectedEvent[]
    return Array.isArray(events) ? events : []
  } catch (e) {
    console.error("[detect-calendar-events] failed:", e)
    return []
  }
}

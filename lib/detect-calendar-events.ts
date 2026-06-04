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

Return a JSON array. Every event must be ONE of these three shapes — nothing else is valid:

SHAPE A — One-off event with known time:
{ title, date, time, end_time, location?, description?, confidence, low_confidence_reason? }
→ date and end_date are always the same day. Never set end_date to a different day.
→ If end time is unknown, omit end_time (do not guess).

SHAPE B — One-off all-day event (time unknown):
{ title, date, location?, description?, confidence, low_confidence_reason? }
→ No time, no end_time, no end_date.

SHAPE C — Recurring event (daily or weekly):
{ title, date, time?, end_time?, location?, description?, recurrence, recurrence_label, confidence, low_confidence_reason? }
→ date = first occurrence only. Never set end_date. Put the series end in RRULE UNTIL.
→ recurrence examples:
    Weekly on Tuesday until Aug 18: "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260818T235959Z"
    Weekly on Mon+Wed until Dec 31: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z"
    Daily until Jun 30:             "RRULE:FREQ=DAILY;UNTIL=20260630T235959Z"
→ recurrence_label: human-readable e.g. "Every Tuesday through August 18, 2026"

Field formats:
- date: YYYY-MM-DD
- time / end_time: zero-padded 24h HH:MM (e.g. "18:00" for 6pm, "09:00" for 9am)
- NEVER set end_date to anything — it is not a valid field in any shape above

Example — "Learn To Swim meets every Tuesday from June 23 to Aug 18, 6:00–6:30pm":
{ "title": "Learn To Swim-Beginning", "date": "2026-06-23", "time": "18:00", "end_time": "18:30", "location": "Ballard Pool Lane #1", "recurrence": "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260818T235959Z", "recurrence_label": "Every Tuesday through August 18, 2026", "confidence": "high" }

Other rules:
- Only events with specific dates (skip vague references)
- Skip events before ${emailDate}
- For flight itineraries: one event per leg (e.g. "Flight LA2476: Lima → Los Angeles"), departure = start time, arrival = end time. Dates may be DD/MM/YY — convert to YYYY-MM-DD.
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

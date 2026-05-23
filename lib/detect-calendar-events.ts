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
- date: string (YYYY-MM-DD, required)
- time: string (HH:MM 24hr, omit if all-day)
- end_date: string (YYYY-MM-DD, only if different from date)
- end_time: string (HH:MM 24hr, if known)
- location: string (if mentioned)
- description: string (max 100 chars)
- recurrence: string (RRULE, e.g. "RRULE:FREQ=WEEKLY;BYDAY=SU" — only if explicitly recurring)
- recurrence_label: string (e.g. "Every Sunday through Dec 2026")
- confidence: "high" if date+event clearly stated, "low" if uncertain/inferred
- low_confidence_reason: string (only when confidence is "low")

Rules:
- Only events with specific dates (skip vague references)
- Recurring events: one entry with recurrence rule, not multiple entries
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

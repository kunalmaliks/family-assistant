import { generateText } from "./ai-provider"

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
  excluded_dates?: string[]
  confidence: "high" | "low"
  low_confidence_reason?: string
}

// Throws on API/parse failure instead of swallowing — callers must decide
// how to surface a failed scan (e.g. a review notification), since silently
// returning [] is indistinguishable from "genuinely no events found".
export async function detectCalendarEvents(
  subject: string,
  body: string,
  emailDate: string
): Promise<DetectedEvent[]> {
  const prompt = `Extract appointments, events, or meetings from this email received on ${emailDate}.

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
{ title, date, time?, end_time?, location?, description?, recurrence, recurrence_label, excluded_dates?, confidence, low_confidence_reason? }
→ date = first occurrence only. Never set end_date. Put the series end in RRULE UNTIL.
→ recurrence examples:
    Weekly on Tuesday until Aug 18: "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260818T235959Z"
    Weekly on Mon+Wed until Dec 31: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z"
    Daily until Jun 30:             "RRULE:FREQ=DAILY;UNTIL=20260630T235959Z"
→ recurrence_label: human-readable e.g. "Every Tuesday through August 18, 2026"
→ excluded_dates: if the email lists specific occurrences that are skipped/canceled (e.g. "Except the following dates: ..."), list every one of them here as YYYY-MM-DD. Do not drop them — a recurring series with unlisted skipped dates is wrong.

Field formats:
- date: YYYY-MM-DD
- time / end_time: zero-padded 24h HH:MM (e.g. "18:00" for 6pm, "09:00" for 9am)
- NEVER set end_date to anything — it is not a valid field in any shape above

Example — "Learn To Swim meets every Tuesday from June 23 to Aug 18, 6:00–6:30pm":
{ "title": "Learn To Swim-Beginning", "date": "2026-06-23", "time": "18:00", "end_time": "18:30", "location": "Ballard Pool Lane #1", "recurrence": "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260818T235959Z", "recurrence_label": "Every Tuesday through August 18, 2026", "confidence": "high" }

Example — compact "Important Dates" list, a common school-newsletter format:
"Important Dates
9/17 Fire drill
9/18 12:30 (K-2) Back to School Assembly with Pacific Science Center
10/8 Back-to-School Night (aka Curriculum Night) 5-6:30"
→ Extract EVERY line as its own event: three separate events on 2026-09-17 (all-day, Shape B), 2026-09-18 at 12:30 (Shape A), and 2026-10-08 from 17:00–18:30 (Shape A). A bare "M/D Title" line is a real one-off event, not a vague reference — do not skip it.

Other rules:
- Only events with specific dates (skip vague references)
- Skip events before ${emailDate}
- Do NOT invent specific calendar dates for a rotating weekly schedule (e.g. "Specialists this week: Monday PE, Tuesday Art, Wednesday Music") — that names a day-of-week pattern, not an appointment. Skip these entirely unless the email also gives an actual date.
- For flight itineraries: one event per leg (e.g. "Flight LA2476: Lima → Los Angeles"), departure = start time, arrival = end time. Dates may be DD/MM/YY — convert to YYYY-MM-DD.
- Return [] if nothing found

JSON array only, no other text.`

  const text = (await generateText(prompt, 1500)) || "[]"
  const stripped = text.replace(/```json|```/g, "").trim()
  const match = stripped.match(/\[[\s\S]*\]/)
  if (!match) {
    throw new Error(`[detect-calendar-events] no JSON array in model response: ${text.slice(0, 300)}`)
  }

  const events = JSON.parse(match[0]) as DetectedEvent[]
  return Array.isArray(events) ? events : []
}

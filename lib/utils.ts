import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Converts internal 24-hour "HH:MM" to display "h:MM AM/PM"
export function formatTime12(time: string | undefined): string | undefined {
  if (!time) return undefined
  const [h, m] = time.split(":").map(Number)
  if (isNaN(h) || isNaN(m)) return time
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

// Normalizes a time string to zero-padded HH:MM 24-hour format.
// Handles "1:00" → "01:00", "13:00" → "13:00", "9:30" → "09:30"
export function normalizeTime(time: string | undefined): string | undefined {
  if (!time) return undefined
  const match = time.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return undefined
  return `${match[1].padStart(2, "0")}:${match[2]}`
}

// Builds a Google Calendar `recurrence` array (RRULE + optional EXDATE) so
// skipped occurrences in a recurring series are actually excluded.
export function buildRecurrenceLines(
  rrule: string,
  excludedDates: unknown,
  time: string | undefined,
  timeZone: string
): string[] {
  const lines = [rrule]
  if (!Array.isArray(excludedDates)) return lines
  const validDates = excludedDates.filter(
    (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
  )
  if (validDates.length === 0) return lines
  const exdate = time
    ? `EXDATE;TZID=${timeZone}:${validDates.map((d) => `${d.replace(/-/g, "")}T${time.replace(":", "")}00`).join(",")}`
    : `EXDATE;VALUE=DATE:${validDates.map((d) => d.replace(/-/g, "")).join(",")}`
  lines.push(exdate)
  return lines
}

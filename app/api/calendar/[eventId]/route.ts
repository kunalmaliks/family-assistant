import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"
import { google } from "googleapis"
import { decryptToken } from "@/lib/token-crypto"
import { normalizeTime, buildRecurrenceLines } from "@/lib/utils"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGAuth(session: any) {
  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return null

  const { data: userRow } = await supabase
    .from("users")
    .select("google_access_token, google_refresh_token")
    .eq("id", user.id)
    .single()

  const gAuth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  gAuth.setCredentials({
    access_token: (session!.accessToken as string) || decryptToken(userRow?.google_access_token),
    refresh_token: decryptToken(userRow?.google_refresh_token),
  })
  return gAuth
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { eventId } = await params
  const body = await req.json()

  const gAuth = await getGAuth(session)
  if (!gAuth) return NextResponse.json({ error: "User not found" }, { status: 404 })

  try {
    const calendar = google.calendar({ version: "v3", auth: gAuth })
    const timeZone = body.timeZone || "UTC"

    // Fetch existing event to fill in any fields not provided by the caller
    const existing = await calendar.events.get({ calendarId: "primary", eventId })
    const ex = existing.data

    const isAllDay = !ex.start?.dateTime

    // Extract current values from the existing event
    const currentDate = (ex.start?.dateTime || ex.start?.date || "").split("T")[0]
    const currentTime = ex.start?.dateTime
      ? ex.start.dateTime.split("T")[1]?.substring(0, 5)
      : undefined
    const currentEndDate = (ex.end?.dateTime || ex.end?.date || "").split("T")[0]
    const currentEndTime = ex.end?.dateTime
      ? ex.end.dateTime.split("T")[1]?.substring(0, 5)
      : undefined

    // Merge: use provided values or fall back to existing; normalize times to HH:MM
    const date     = body.date     ?? currentDate
    const time     = normalizeTime(body.time     ?? (isAllDay ? undefined : currentTime))
    const end_date = body.end_date ?? currentEndDate
    const end_time = normalizeTime(body.end_time ?? (isAllDay ? undefined : currentEndTime))
    const title    = body.title       ?? ex.summary
    const location = body.location   !== undefined ? body.location : ex.location
    const description = body.description !== undefined ? body.description : ex.description

    // Recurrence: only touch it if the caller is changing the RRULE or the
    // exception dates. Otherwise omit the key so patch() leaves it alone.
    let recurrence: string[] | undefined
    if (body.recurrence !== undefined || body.excluded_dates !== undefined) {
      const existingRecurrence: string[] = ex.recurrence || []
      const rrule = body.recurrence ?? existingRecurrence.find((r) => r.toUpperCase().startsWith("RRULE"))
      if (rrule) {
        const excludedDates = body.excluded_dates !== undefined
          ? body.excluded_dates
          // no new exceptions given — keep any dates already excluded
          : existingRecurrence
              .filter((r) => r.toUpperCase().startsWith("EXDATE"))
              .flatMap((r) => (r.split(":")[1] || "").split(","))
              .map((d) => d.slice(0, 8))
              .filter(Boolean)
              .map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`)
        recurrence = buildRecurrenceLines(rrule, excludedDates, time, timeZone)
      }
    }

    const event = await calendar.events.patch({
      calendarId: "primary",
      eventId,
      requestBody: {
        summary: title,
        description,
        location,
        start: time
          ? { dateTime: `${date}T${time}:00`, timeZone }
          : { date },
        end: end_time
          ? { dateTime: `${end_date}T${end_time}:00`, timeZone }
          : { date: end_date },
        recurrence,
      },
    })

    return NextResponse.json({ event: event.data })
  } catch (e: any) {
    const msg = e?.errors?.[0]?.message || e?.message || String(e)
    const status = e?.code || e?.status || 500
    console.error("[calendar] event update failed:", status, msg, e)
    return NextResponse.json({ error: `Failed to update calendar event: ${msg}` }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { eventId } = await params

  const gAuth = await getGAuth(session)
  if (!gAuth) return NextResponse.json({ error: "User not found" }, { status: 404 })

  try {
    const calendar = google.calendar({ version: "v3", auth: gAuth })
    await calendar.events.delete({ calendarId: "primary", eventId })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[calendar] event delete failed:", e)
    return NextResponse.json({ error: "Failed to delete calendar event" }, { status: 500 })
  }
}

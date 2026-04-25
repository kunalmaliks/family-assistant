import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"
import { google } from "googleapis"
import { decryptToken } from "@/lib/token-crypto"

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
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // Fetch existing event to fill in any fields not provided by the caller
    const existing = await calendar.events.get({ calendarId: "primary", eventId })
    const ex = existing.data

    const isAllDay = !ex.start?.dateTime

    // Extract current values from the existing event
    const currentDate = (ex.start?.dateTime || ex.start?.date || "").split("T")[0]
    const currentTime = ex.start?.dateTime
      ? new Date(ex.start.dateTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      : undefined
    const currentEndDate = (ex.end?.dateTime || ex.end?.date || "").split("T")[0]
    const currentEndTime = ex.end?.dateTime
      ? new Date(ex.end.dateTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      : undefined

    // Merge: use provided values or fall back to existing
    const date     = body.date     ?? currentDate
    const time     = body.time     ?? (isAllDay ? undefined : currentTime)
    const end_date = body.end_date ?? currentEndDate
    const end_time = body.end_time ?? (isAllDay ? undefined : currentEndTime)
    const title    = body.title       ?? ex.summary
    const location = body.location   !== undefined ? body.location : ex.location
    const description = body.description !== undefined ? body.description : ex.description

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
      },
    })

    return NextResponse.json({ event: event.data })
  } catch (e) {
    console.error("[calendar] event update failed:", e)
    return NextResponse.json({ error: "Failed to update calendar event" }, { status: 500 })
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

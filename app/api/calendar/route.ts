import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"
import { fetchCalendarEvents } from "@/lib/calendar"
import { google } from "googleapis"
import { decryptToken } from "@/lib/token-crypto"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const monthsAhead = Math.min(parseInt(searchParams.get("months") || "2"), 11)

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const { data: userRow } = await supabase
    .from("users")
    .select("google_access_token, google_refresh_token")
    .eq("id", user.id)
    .single()

  const accessToken = (session.accessToken as string) || decryptToken(userRow?.google_access_token) || ""
  const refreshToken = decryptToken(userRow?.google_refresh_token) || null

  const events = await fetchCalendarEvents(accessToken, refreshToken, monthsAhead)
  return NextResponse.json({ events })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, date, time, end_date, end_time, location, description, recurrence } = await req.json()

  const eventDate = new Date(time ? `${date}T${time}:00` : `${date}T23:59:59`)
  if (eventDate < new Date()) {
    return NextResponse.json({ error: "Cannot add past events to calendar" }, { status: 400 })
  }
  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const { data: userRow } = await supabase
    .from("users")
    .select("google_access_token, google_refresh_token")
    .eq("id", user.id)
    .single()

  try {
    const gAuth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    gAuth.setCredentials({
      access_token: (session.accessToken as string) || decryptToken(userRow?.google_access_token),
      refresh_token: decryptToken(userRow?.google_refresh_token),
    })

    const calendar = google.calendar({ version: "v3", auth: gAuth })

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        location,
        start: time
          ? { dateTime: `${date}T${time}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : { date },
        end: end_time
          ? { dateTime: `${end_date || date}T${end_time}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : end_date
          ? { date: end_date }
          : time
          ? { dateTime: `${date}T${time}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : { date },
        recurrence: recurrence ? [recurrence] : undefined,
        reminders: { useDefault: true },
      },
    })

    return NextResponse.json({ event: event.data })
  } catch (e) {
    console.error("[calendar] event create failed:", e)
    return NextResponse.json({ error: "Failed to create calendar event" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ settings: null })

  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", user.id)
    .single()

  return NextResponse.json({ settings })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const supabase = createSupabaseAdminClient()

  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "Could not create user" }, { status: 500 })

  const upsertData: Record<string, unknown> = { user_id: user.id }
  if (body.sync_frequency !== undefined) upsertData.sync_frequency = body.sync_frequency
  if (body.lookback_period !== undefined) upsertData.lookback_period = body.lookback_period
  if (body.notification_preferences !== undefined) upsertData.notification_preferences = body.notification_preferences
  if (body.timezone !== undefined) upsertData.timezone = body.timezone

  const { data } = await supabase
    .from("settings")
    .upsert(upsertData, { onConflict: "user_id" })
    .select()
    .single()

  return NextResponse.json({ settings: data })
}

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

  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    sync_frequency: body.sync_frequency ?? "30min",
    lookback_period: body.lookback_period ?? "1month",
    notification_preferences: body.notification_preferences ?? {},
  }
  if (body.timezone) upsertData.timezone = body.timezone

  const { data } = await supabase
    .from("settings")
    .upsert(upsertData, { onConflict: "user_id" })
    .select()
    .single()

  return NextResponse.json({ settings: data })
}

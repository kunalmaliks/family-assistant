import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"
import { syncEmailsForUser } from "@/lib/gmail"
import { decryptToken, encryptToken } from "@/lib/token-crypto"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const accessToken = session.accessToken
  if (!accessToken) {
    return NextResponse.json(
      { error: "No Google access token in session — please sign out and sign back in" },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "Could not resolve user" }, { status: 500 })

  // Fetch refresh token from DB and persist fresh access token
  const { data: userRow } = await supabase
    .from("users")
    .select("google_refresh_token")
    .eq("id", user.id)
    .single()

  await supabase
    .from("users")
    .update({ google_access_token: encryptToken(accessToken) })
    .eq("id", user.id)

  const refreshToken = decryptToken(userRow?.google_refresh_token) || ""

  const { data: settings } = await supabase
    .from("settings")
    .select("lookback_period, last_synced_at, timezone")
    .eq("user_id", user.id)
    .single()

  const lookbackDays =
    settings?.lookback_period === "6months" ? 180
    : settings?.lookback_period === "3months" ? 90
    : 30

  const lastSyncedAt: string | null = settings?.last_synced_at ?? null

  const body = await req.json().catch(() => ({}))
  const ruleId: string | undefined = body.rule_id

  try {
    const summary = await syncEmailsForUser(session.user.email, accessToken, refreshToken, lookbackDays, ruleId, user.id, lastSyncedAt, settings?.timezone ?? undefined)
    await supabase.from("settings").upsert(
      { user_id: user.id, last_synced_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    return NextResponse.json({ success: true, summary })
  } catch (e) {
    console.error("[sync] error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

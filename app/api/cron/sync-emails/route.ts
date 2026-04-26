import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { syncEmailsForUser } from "@/lib/gmail"
import { decryptToken } from "@/lib/token-crypto"

// Vercel Cron: runs every 30 minutes
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  // Get all users with tokens
  const { data: users } = await supabase
    .from("users")
    .select("id, email, google_access_token, google_refresh_token")
    .not("google_access_token", "is", null)

  const results = []
  for (const user of users || []) {
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("sync_frequency, lookback_period, last_synced_at")
        .eq("user_id", user.id)
        .single()

      // Check if enough time has passed since last sync
      if (settings?.last_synced_at && settings?.sync_frequency) {
        const minutesSinceLast = (Date.now() - new Date(settings.last_synced_at).getTime()) / 60000
        const requiredMinutes = settings.sync_frequency === "2hour" ? 120 : settings.sync_frequency === "1hour" ? 60 : 30
        if (minutesSinceLast < requiredMinutes - 2) {
          results.push({ email: user.email, status: "skipped", reason: "frequency" })
          continue
        }
      }

      const lookbackDays = settings?.lookback_period === "6months" ? 180 : settings?.lookback_period === "3months" ? 90 : 30

      await syncEmailsForUser(user.email, decryptToken(user.google_access_token), decryptToken(user.google_refresh_token), lookbackDays, undefined, user.id)

      await supabase.from("settings").upsert(
        { user_id: user.id, last_synced_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )

      results.push({ email: user.email, status: "ok" })
    } catch (e) {
      results.push({ email: user.email, status: "error", error: String(e) })
    }
  }

  return NextResponse.json({ synced: results.length, results })
}

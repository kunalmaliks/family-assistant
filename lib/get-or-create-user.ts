import { createSupabaseAdminClient } from "./supabase"

interface SessionLike {
  user?: { email?: string | null; name?: string | null } | null
}

export async function getOrCreateUser(session: SessionLike) {
  const supabase = createSupabaseAdminClient()
  const email = session.user?.email
  if (!email) return null

  // Try to find existing user first
  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single()

  if (existing) return existing

  // PGRST116 = no rows found, anything else is a real error
  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("[getOrCreateUser] fetch error:", fetchError)
    return null
  }

  // Insert new user
  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ email, name: session.user?.name })
    .select("id")
    .single()

  if (insertError) {
    console.error("[getOrCreateUser] insert error:", insertError)
    return null
  }

  return created
}

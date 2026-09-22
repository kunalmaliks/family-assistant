import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"
import type { Category } from "@/lib/supabase"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const { category }: { category: Category } = await req.json()
  const { id } = await params

  // Update email category (only if it belongs to this user)
  await supabase.from("emails").update({ category }).eq("id", id).eq("user_id", user.id)

  // Get the email to create a rule from
  const { data: email } = await supabase
    .from("emails")
    .select("sender")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (email?.sender) {
    // Save correction as a sender rule for future emails
    const senderEmail = email.sender.match(/<(.+)>/)?.[1] || email.sender
    await supabase.from("category_rules").upsert(
      {
        user_id: user.id,
        rule_type: "sender",
        rule_value: senderEmail,
        category,
      },
      { onConflict: "user_id,rule_type,rule_value" }
    )
  }

  return NextResponse.json({ success: true })
}

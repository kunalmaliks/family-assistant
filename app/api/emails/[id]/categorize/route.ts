import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import type { Category } from "@/lib/supabase"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { category }: { category: Category } = await req.json()
  const { id } = await params

  const supabase = createSupabaseAdminClient()

  // Update email category
  await supabase.from("emails").update({ category }).eq("id", id)

  // Get the email to create a rule from
  const { data: email } = await supabase
    .from("emails")
    .select("sender")
    .eq("id", id)
    .single()

  if (email?.sender) {
    // Get user id
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.user.email)
      .single()

    if (user) {
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
  }

  return NextResponse.json({ success: true })
}

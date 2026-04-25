import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseAdminClient()
  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")

  const ruleId = searchParams.get("rule_id")

  let query = supabase
    .from("emails")
    .select("id, gmail_id, sender, subject, body, date_received, category, has_attachment")
    .order("date_received", { ascending: false })
    .limit(50)

  if (category) query = query.eq("category", category)

  if (ruleId) {
    const { data: rule } = await supabase
      .from("category_rules")
      .select("rule_type, rule_value")
      .eq("id", ruleId)
      .single()
    if (rule) {
      if (rule.rule_type === "domain" || rule.rule_type === "sender") {
        query = query.ilike("sender", `%${rule.rule_value}%`)
      } else if (rule.rule_type === "keyword") {
        query = query.or(`subject.ilike.%${rule.rule_value}%,body.ilike.%${rule.rule_value}%`)
      }
    }
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ emails: data || [] })
}

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ rules: [] })

  const { data: rules } = await supabase
    .from("category_rules")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return NextResponse.json({ rules: rules || [] })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rule_type, rule_value, category } = await req.json()
  const supabase = createSupabaseAdminClient()

  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "Could not create user" }, { status: 500 })

  const { data: rule, error } = await supabase
    .from("category_rules")
    .insert({ user_id: user.id, rule_type, rule_value, category })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rule })
}

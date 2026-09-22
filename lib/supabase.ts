import { createClient } from "@supabase/supabase-js"

export function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createSupabaseAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type Category = "School" | "Payments" | "Travel" | "Activities" | "Other"

export interface Email {
  id: string
  user_id: string
  gmail_id: string
  sender: string
  subject: string
  body: string
  date_received: string
  category: Category
  has_attachment: boolean
}

export interface ChatMessage {
  id: string
  user_id: string
  message: string
  role: "user" | "assistant"
  timestamp: string
}

export interface CategoryRule {
  id: string
  user_id: string
  rule_type: "sender" | "domain" | "keyword"
  rule_value: string
  category: Category
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  sync_frequency: "30min" | "1hour" | "2hour"
  lookback_period: "1month" | "3months" | "6months"
  notification_preferences: {
    urgent_emails: boolean
    calendar_reminders: boolean
    daily_summary: boolean
  }
  created_at: string
}

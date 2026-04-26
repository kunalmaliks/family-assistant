import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { getOrCreateUser } from "@/lib/get-or-create-user"
import { fetchCalendarEvents, formatEventsForContext } from "@/lib/calendar"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { decryptToken } from "@/lib/token-crypto"

const calendarTool: Anthropic.Tool = {
  name: "suggest_calendar_event",
  description:
    "Call this whenever you detect a specific schedulable event, deadline, or appointment mentioned in the emails or conversation. Only call it when you have a concrete date that is in the future. Never suggest past events. For recurring events, use the recurrence field.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Short event title" },
      date: { type: "string", description: "Start date of the first occurrence in YYYY-MM-DD format" },
      time: { type: "string", description: "Start time in HH:MM format (24h), omit if all-day" },
      end_date: { type: "string", description: "End date in YYYY-MM-DD format, defaults to same as date" },
      end_time: { type: "string", description: "End time in HH:MM format (24h), omit if all-day" },
      location: { type: "string", description: "Location if mentioned" },
      description: { type: "string", description: "Brief context from the email" },
      recurrence: { type: "string", description: "RRULE string for recurring events, e.g. RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20261231T235959Z. Only include if the event repeats." },
      recurrence_label: { type: "string", description: "Human-readable recurrence description shown to the user, e.g. 'Every Sunday until Dec 31, 2026'" },
    },
    required: ["title", "date"],
  },
}

const editCalendarTool: Anthropic.Tool = {
  name: "edit_calendar_event",
  description:
    "Call this when the user wants to modify an existing calendar event. Use the event ID from the calendar context (shown as [ID:xxx]). Only include fields that are changing.",
  input_schema: {
    type: "object" as const,
    properties: {
      event_id: { type: "string", description: "The Google Calendar event ID from the context ([ID:xxx])" },
      title: { type: "string", description: "New event title" },
      date: { type: "string", description: "New start date in YYYY-MM-DD format" },
      time: { type: "string", description: "New start time in HH:MM format (24h)" },
      end_date: { type: "string", description: "New end date in YYYY-MM-DD format" },
      end_time: { type: "string", description: "New end time in HH:MM format (24h)" },
      location: { type: "string", description: "New location" },
      description: { type: "string", description: "New description" },
      summary: { type: "string", description: "Human-readable summary of what is changing, e.g. 'Move Ballet Class to 3:00–3:45 PM'" },
    },
    required: ["event_id", "summary"],
  },
}

type EmailRow = { id: string; subject: string; sender: string; date_received: string; body: string; category: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function formatEmailsWithAttachments(supabase: any, emails: EmailRow[]): Promise<string[]> {
  if (emails.length === 0) return []
  const emailIds = emails.map((e) => e.id)
  const { data: attachments } = await supabase
    .from("attachments")
    .select("email_id, file_name, text_content")
    .in("email_id", emailIds)
    .not("text_content", "is", null)

  const attachByEmail = new Map<string, Array<{ file_name: string; text_content: string }>>()
  for (const a of attachments || []) {
    if (!attachByEmail.has(a.email_id)) attachByEmail.set(a.email_id, [])
    attachByEmail.get(a.email_id)!.push(a)
  }

  return emails.map((e) => {
    let text = `[${e.category}] ${e.subject} (from ${e.sender}, ${new Date(e.date_received).toLocaleDateString()})\n${e.body.slice(0, 2000)}`
    const atts = attachByEmail.get(e.id) || []
    for (const a of atts) {
      text += `\n📎 ${a.file_name}:\n${a.text_content.slice(0, 2000)}`
    }
    return text
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ messages: [] })

  const { data } = await supabase
    .from("chat_history")
    .select("id, role, message, timestamp")
    .eq("user_id", user.id)
    .order("timestamp", { ascending: true })
    .limit(100)

  return NextResponse.json({ messages: data || [] })
}

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { message } = await req.json()
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const user = await getOrCreateUser(session)
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Build expanded RAG query using recent history for context on short follow-ups
  const { data: recentHistory } = await supabase
    .from("chat_history")
    .select("role, message")
    .eq("user_id", user.id)
    .order("timestamp", { ascending: false })
    .limit(4)

  const recentContext = (recentHistory || [])
    .reverse()
    .map((h: { role: string; message: string }) => h.message)
    .join(" ")
  const ragQuery = message.length < 60 && recentContext
    ? `${message} ${recentContext}`.slice(0, 1000)
    : message

  // RAG: find relevant emails
  let relevantEmails: string[] = []
  try {
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: ragQuery,
    })
    const embedding = embeddingRes.data[0].embedding
    const query = supabase.rpc("match_emails", { query_embedding: embedding, match_count: 15, match_threshold: 0.3 })
    const { data: emails } = await query
    relevantEmails = await formatEmailsWithAttachments(supabase, emails || [])
  } catch {
    const { data: emails } = await supabase
      .from("emails")
      .select("id, subject, sender, date_received, body, category")
      .order("date_received", { ascending: false })
      .limit(15)
    relevantEmails = await formatEmailsWithAttachments(supabase, emails || [])
  }

  // Fetch upcoming calendar events for context
  const { data: userRow } = await supabase
    .from("users")
    .select("google_access_token, google_refresh_token")
    .eq("id", user.id)
    .single()

  const accessToken = (session.accessToken as string) || decryptToken(userRow?.google_access_token) || ""
  const calendarEvents = await fetchCalendarEvents(accessToken, decryptToken(userRow?.google_refresh_token) || null, 2)
  const calendarContext = formatEventsForContext(calendarEvents)

  // Get last 10 chat messages
  const { data: history } = await supabase
    .from("chat_history")
    .select("role, message")
    .eq("user_id", user.id)
    .order("timestamp", { ascending: false })
    .limit(10)

  const historyMessages = (history || []).reverse().map((h: { role: string; message: string }) => ({
    role: h.role as "user" | "assistant",
    content: h.message,
  }))

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

  const systemPrompt = `You are a helpful family assistant managing emails, events, and family life (school, daycare, payments, appointments).

TODAY'S DATE: ${today}

FORMATTING RULES — always follow these:
- Use **bold** for names, dates, amounts, and key terms
- Use bullet points for lists of 2+ items
- Use short sections with a heading line (e.g. "📅 Upcoming:") when covering multiple topics
- Keep each bullet to one line
- Never write walls of text — break into scannable chunks
- If no relevant emails found, say so clearly in one line
- If the question has no connection to the emails, calendar, or family life, answer in one sentence maximum and suggest using a general search tool for more detail

CALENDAR TOOL: Only call suggest_calendar_event for events with a date AFTER today (${today}). Never suggest adding past events to the calendar.

📅 UPCOMING CALENDAR EVENTS (next 3 months):
${calendarContext}

📧 RELEVANT EMAILS:
${relevantEmails.length > 0 ? relevantEmails.join("\n\n---\n\n") : "No emails synced yet."}`

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    tools: [calendarTool, editCalendarTool],
    messages: [
      ...historyMessages,
      { role: "user", content: message },
    ],
  })

  // Extract text and any calendar suggestion from response
  let assistantMessage = ""
  const calendarSuggestions: Record<string, string | undefined>[] = []
  let calendarEdit: Record<string, string | undefined> | null = null

  for (const block of response.content) {
    if (block.type === "text") {
      assistantMessage += block.text
    } else if (block.type === "tool_use" && block.name === "suggest_calendar_event") {
      calendarSuggestions.push(block.input as Record<string, string>)
    } else if (block.type === "tool_use" && block.name === "edit_calendar_event") {
      calendarEdit = block.input as Record<string, string>
    }
  }

  if (!assistantMessage) {
    if (calendarSuggestions.length > 0) {
      assistantMessage = calendarSuggestions.map(s => `I found an event: **${s.title}** on **${s.date}**.`).join("\n")
    } else if (calendarEdit) {
      assistantMessage = `Ready to update: **${calendarEdit.summary}**`
    } else {
      assistantMessage = "Sorry, I couldn't process that."
    }
  }

  // Save to chat history
  await supabase.from("chat_history").insert([
    { user_id: user.id, message, role: "user" },
    { user_id: user.id, message: assistantMessage, role: "assistant" },
  ])

  return NextResponse.json({ response: assistantMessage, calendarSuggestions, calendarEdit })
}

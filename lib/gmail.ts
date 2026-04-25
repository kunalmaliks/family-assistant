import { google } from "googleapis"
import { createSupabaseAdminClient } from "./supabase"
import OpenAI from "openai"
import type { Category } from "./supabase"

export interface SyncSummary {
  fetched: number
  matched: number
  skipped: number
  alreadyExisted: number
  inserted: number
}

export async function syncEmailsForUser(
  userEmail: string,
  accessToken: string,
  refreshToken: string,
  lookbackDays = 30,
  ruleId?: string
): Promise<SyncSummary> {
  const supabase = createSupabaseAdminClient()
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken })

  const gmail = google.gmail({ version: "v1", auth })

  const after = new Date()
  after.setDate(after.getDate() - lookbackDays)
  const afterTimestamp = Math.floor(after.getTime() / 1000)

  // Load category rules
  let rulesQuery = supabase.from("category_rules").select("id, rule_type, rule_value, category")
  if (ruleId) rulesQuery = rulesQuery.eq("id", ruleId)
  const { data: rules } = await rulesQuery

  // Build Gmail search query — narrow by rule criteria when syncing a single rule
  let gmailQuery = `after:${afterTimestamp}`
  if (ruleId && rules && rules.length === 1) {
    const rule = rules[0]
    if (rule.rule_type === "domain") {
      gmailQuery += ` from:${rule.rule_value.startsWith("@") ? rule.rule_value : "@" + rule.rule_value}`
    } else if (rule.rule_type === "sender") {
      gmailQuery += ` from:${rule.rule_value}`
    } else if (rule.rule_type === "keyword") {
      gmailQuery += ` ${rule.rule_value}`
    }
  }

  // Fetch message IDs with pagination
  const allMessageIds: string[] = []
  let pageToken: string | undefined
  while (true) {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: gmailQuery,
      maxResults: 500,
      pageToken,
    })
    for (const msg of listRes.data.messages || []) {
      if (msg.id) allMessageIds.push(msg.id)
    }
    if (!listRes.data.nextPageToken) break
    pageToken = listRes.data.nextPageToken
  }

  // Load existing gmail_ids to avoid duplicates
  const { data: existing } = await supabase.from("emails").select("gmail_id")
  const existingIds = new Set((existing || []).map((e: { gmail_id: string }) => e.gmail_id))

  const summary: SyncSummary = {
    fetched: allMessageIds.length,
    matched: 0,
    skipped: 0,
    alreadyExisted: 0,
    inserted: 0,
  }

  for (const messageId of allMessageIds) {
    if (existingIds.has(messageId)) {
      summary.alreadyExisted++
      continue
    }

    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      })

      const headers = msgRes.data.payload?.headers || []
      const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)"
      const sender = headers.find((h) => h.name === "From")?.value || ""
      const dateStr = headers.find((h) => h.name === "Date")?.value || ""

      const rawBody = extractBody(msgRes.data.payload)
      const body = rawBody.slice(0, 20000).replace(/\s+/g, " ").trim()

      const attachmentParts = collectAttachments(msgRes.data.payload)
      const hasAttachment = attachmentParts.length > 0

      const category = categorizeEmail(subject, body, sender, rules || [])
      if (!category) {
        summary.skipped++
        continue
      }

      summary.matched++

      // Extract attachment text before embedding so it's included in the vector
      const attachmentRows = await Promise.all(
        attachmentParts.map(async (a) => ({
          file_name: a.filename,
          file_url: a.attachmentId ? `gmail:${messageId}:${a.attachmentId}` : null,
          text_content: a.attachmentId
            ? await extractAttachmentText(gmail, messageId, a.attachmentId, a.mimeType, a.filename)
            : null,
        }))
      )

      const attachmentText = attachmentRows
        .map((a) => a.text_content)
        .filter(Boolean)
        .join("\n")

      let embedding = null
      try {
        const embRes = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: `${subject}\n${body}${attachmentText ? "\n" + attachmentText : ""}`.slice(0, 8000),
        })
        embedding = embRes.data[0].embedding
      } catch {}

      const { data: insertedEmail, error: insertError } = await supabase
        .from("emails")
        .insert({
          gmail_id: messageId,
          sender,
          subject,
          body,
          date_received: new Date(dateStr).toISOString(),
          category,
          embedding,
          has_attachment: hasAttachment,
        })
        .select("id")
        .single()

      if (insertError) {
        // Unique constraint violation = another concurrent sync already inserted it
        summary.alreadyExisted++
        continue
      }

      if (insertedEmail && attachmentRows.length > 0) {
        await supabase.from("attachments").insert(
          attachmentRows.map((a) => ({ ...a, email_id: insertedEmail.id }))
        )
      }
      summary.inserted++
    } catch {
      summary.skipped++
    }
  }

  return summary
}

const EXTRACTABLE_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/html",
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractAttachmentText(gmail: any, messageId: string, attachmentId: string, mimeType: string, filename: string): Promise<string | null> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const isPdf = mimeType === "application/pdf" || ext === "pdf"
  const isText = mimeType.startsWith("text/") || ext === "csv" || ext === "txt"

  if (!isPdf && !isText && !EXTRACTABLE_TYPES.has(mimeType)) return null

  try {
    const res = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    })
    const data: string = res.data.data ?? ""
    const buffer = Buffer.from(data, "base64")

    if (isPdf) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>
      const parsed = await pdfParse(buffer)
      return parsed.text.slice(0, 5000).replace(/\s+/g, " ").trim()
    }

    if (isText) {
      const text = buffer.toString("utf-8")
      if (mimeType === "text/html") {
        return text.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").slice(0, 5000).replace(/\s+/g, " ").trim()
      }
      return text.slice(0, 5000).replace(/\s+/g, " ").trim()
    }
  } catch (e) {
    console.error(`[gmail] attachment extract failed (${filename}):`, e)
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeBase64(data: string): string {
  return Buffer.from(data, "base64").toString("utf-8")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): string {
  if (!payload) return ""

  // Non-multipart message with inline body data
  if (payload.body?.data) {
    const text = decodeBase64(payload.body.data)
    if (payload.mimeType === "text/html") return stripHtml(text)
    return text
  }

  const parts: any[] = payload.parts || []
  if (parts.length === 0) return ""

  // Collect all text/plain parts and join them
  const plainParts = parts.filter(p => p.mimeType === "text/plain" && p.body?.data)
  if (plainParts.length > 0) {
    return plainParts.map(p => decodeBase64(p.body.data)).join("\n")
  }

  // Recurse into multipart/* children
  for (const part of parts) {
    if (part.mimeType?.startsWith("multipart/")) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  // Fall back: collect all text/html parts and strip tags
  const htmlParts = parts.filter(p => p.mimeType === "text/html" && p.body?.data)
  if (htmlParts.length > 0) {
    return htmlParts.map(p => stripHtml(decodeBase64(p.body.data))).join("\n")
  }

  return ""
}

interface AttachmentMeta {
  filename: string
  mimeType: string
  attachmentId: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectAttachments(payload: any, result: AttachmentMeta[] = []): AttachmentMeta[] {
  if (!payload) return result
  for (const part of payload.parts || []) {
    if (part.filename && part.filename.length > 0) {
      result.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        attachmentId: part.body?.attachmentId ?? null,
      })
    }
    if (part.parts) collectAttachments(part, result)
  }
  return result
}

function categorizeEmail(
  subject: string,
  body: string,
  sender: string,
  rules: Array<{ rule_type: string; rule_value: string; category: string }>
): Category | null {
  const senderLower = sender.toLowerCase()
  const subjectLower = subject.toLowerCase()
  const bodySnippet = body.slice(0, 200).toLowerCase()

  for (const rule of rules) {
    const val = rule.rule_value.toLowerCase()
    if (rule.rule_type === "sender" && senderLower.includes(val)) return rule.category as Category
    if (rule.rule_type === "domain" && senderLower.includes(val)) return rule.category as Category
    if (
      rule.rule_type === "keyword" &&
      (subjectLower.includes(val) || bodySnippet.includes(val))
    )
      return rule.category as Category
  }

  return null
}

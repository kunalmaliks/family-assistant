import Anthropic from "@anthropic-ai/sdk"
import { GoogleGenAI } from "@google/genai"

// Routes AI call sites — calendar detection, duplicate-check, daily brief,
// attachment OCR, and chat — between Claude and Gemini. Set AI_PROVIDER=gemini
// to switch everything; unset/anything else keeps the original Claude
// behavior.
const PROVIDER = process.env.AI_PROVIDER === "gemini" ? "gemini" : "claude"

const CLAUDE_MODEL = "claude-haiku-4-5-20251001"
const CLAUDE_CHAT_MODEL = "claude-sonnet-4-6"
// gemini-2.5-flash-lite returns a hard 404 ("no longer available to new
// users") on this account as of 2026-09-23 — confirmed via live API call,
// not a future-risk guess. Google's own error recommends this replacement.
const GEMINI_MODEL = "gemini-3.5-flash-lite"

export async function generateText(prompt: string, maxTokens: number): Promise<string> {
  if (PROVIDER === "gemini") {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { maxOutputTokens: maxTokens },
    })
    return res.text ?? ""
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  })
  return res.content[0].type === "text" ? res.content[0].text : ""
}

export async function generateVisionText(
  buffer: Buffer,
  mimeType: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const base64 = buffer.toString("base64")

  if (PROVIDER === "gemini") {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: "user",
        parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
      }],
      config: { maxOutputTokens: maxTokens },
    })
    return res.text ?? ""
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const isPdf = mimeType === "application/pdf"
  const contentBlock = isPdf
    ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
    : ({
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: base64,
        },
      } as const)

  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
  })
  return res.content[0].type === "text" ? res.content[0].text : ""
}

export interface ChatToolCall {
  name: string
  input: Record<string, unknown>
}

export interface ChatResult {
  text: string
  toolCalls: ChatToolCall[]
}

export async function generateChatResponse(
  systemPrompt: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
  tools: Anthropic.Tool[],
  maxTokens: number
): Promise<ChatResult> {
  if (PROVIDER === "gemini") {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const functionDeclarations = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parametersJsonSchema: t.input_schema,
    }))
    const contents = [
      ...history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: [{ text: userMessage }] },
    ]

    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: maxTokens,
        tools: [{ functionDeclarations }],
      },
    })

    const toolCalls: ChatToolCall[] = (res.functionCalls ?? []).map((fc) => ({
      name: fc.name ?? "",
      input: (fc.args ?? {}) as Record<string, unknown>,
    }))
    return { text: res.text ?? "", toolCalls }
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: CLAUDE_CHAT_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools,
    messages: [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userMessage },
    ],
  })

  let text = ""
  const toolCalls: ChatToolCall[] = []
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text
    } else if (block.type === "tool_use") {
      toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> })
    }
  }
  return { text, toolCalls }
}

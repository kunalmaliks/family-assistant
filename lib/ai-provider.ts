import Anthropic from "@anthropic-ai/sdk"
import { GoogleGenAI } from "@google/genai"

// Routes the 4 cheap-tier ("Haiku") AI call sites — calendar detection,
// duplicate-check, daily brief, attachment OCR — between Claude and Gemini.
// Chat stays on Claude Sonnet always; this switch is scoped to volume-driven
// background work only. Set AI_PROVIDER=gemini to switch; unset/anything
// else keeps the original Claude behavior.
const PROVIDER = process.env.AI_PROVIDER === "gemini" ? "gemini" : "claude"

const CLAUDE_MODEL = "claude-haiku-4-5-20251001"
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

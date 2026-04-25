import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error("TOKEN_ENCRYPTION_KEY is not set")
  return Buffer.from(hex, "hex")
}

export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`
}

export function decryptToken(value: string | null | undefined): string {
  if (!value) return ""
  // If it doesn't look encrypted (no dots), treat as plaintext (migration case)
  const parts = value.split(".")
  if (parts.length !== 3) return value
  try {
    const key = getKey()
    const iv = Buffer.from(parts[0], "base64")
    const authTag = Buffer.from(parts[1], "base64")
    const ciphertext = Buffer.from(parts[2], "base64")
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(ciphertext) + decipher.final("utf8")
  } catch {
    // If decryption fails, return as-is (handles legacy plaintext tokens)
    return value
  }
}

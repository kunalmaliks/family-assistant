import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { createSupabaseAdminClient } from "@/lib/supabase"
import { encryptToken } from "@/lib/token-crypto"

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Token refresh failed")

  return {
    accessToken: data.access_token as string,
    // Google only returns a new refresh token if it was rotated; keep old one otherwise
    refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in as number),
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // First sign-in: store tokens and expiry
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          // expires_at is seconds since epoch; subtract 60s buffer
          expiresAt: (account.expires_at ?? Math.floor(Date.now() / 1000) + 3600) - 60,
        }
      }

      // Token still valid
      if (Date.now() / 1000 < (token.expiresAt as number)) {
        return token
      }

      // Token expired — refresh it
      if (!token.refreshToken) {
        console.error("[auth] No refresh token available")
        return { ...token, error: "RefreshTokenMissing" }
      }

      try {
        const refreshed = await refreshAccessToken(token.refreshToken as string)

        // Persist fresh access token to Supabase so cron job has it too
        if (token.email) {
          const supabase = createSupabaseAdminClient()
          await supabase
            .from("users")
            .update({
              google_access_token: encryptToken(refreshed.accessToken),
              google_refresh_token: encryptToken(refreshed.refreshToken),
            })
            .eq("email", token.email as string)
        }

        return {
          ...token,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
          error: undefined,
        }
      } catch (e) {
        console.error("[auth] Token refresh failed:", e)
        return { ...token, error: "RefreshTokenError" }
      }
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      if (token.error) session.error = token.error as string
      return session
    },

    async signIn({ user, account }) {
      if (!user.email) return false
      const supabase = createSupabaseAdminClient()

      // Allowlist gate: only emails that already have a users row may sign in.
      // This app is limited-beta — new accounts are never auto-created here.
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", user.email)
        .single()
      if (!existing) return false

      await supabase.from("users").upsert(
        {
          email: user.email,
          name: user.name,
          google_access_token: account?.access_token ? encryptToken(account.access_token) : null,
          google_refresh_token: account?.refresh_token ? encryptToken(account.refresh_token) : null,
        },
        { onConflict: "email" }
      )
      return true
    },
  },
  pages: {
    signIn: "/login",
  },
})

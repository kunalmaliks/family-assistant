"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    setLoading(true)
    await signIn("google", { callbackUrl: "/chat" })
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo / Icon */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-3xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <span className="text-4xl">🏠</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Family Assistant</h1>
            <p className="text-zinc-400 text-sm mt-1">Your AI-powered family organizer</p>
          </div>
        </div>

        {/* Features list */}
        <div className="w-full space-y-3">
          {[
            { icon: "✉️", text: "Smart email summaries" },
            { icon: "📅", text: "Auto calendar events" },
            { icon: "🔔", text: "Urgent alerts" },
          ].map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-3"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-zinc-300 text-sm">{item.text}</span>
            </div>
          ))}
        </div>

        {/* Sign in button */}
        <Button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-base rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Signing in...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </span>
          )}
        </Button>

        <p className="text-zinc-600 text-xs text-center">
          We only access your Gmail and Calendar to help manage your family.
        </p>
      </div>
    </div>
  )
}

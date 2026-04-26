"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessageSquare, Mail, Calendar, Settings, Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

const tabs = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/emails", label: "Emails", icon: Mail },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setUnreadCount(d.notifications?.length ?? 0))
      .catch(() => {})
  }, [pathname])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 pb-safe">
      <div className="flex items-stretch max-w-lg mx-auto">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          const isAlerts = href === "/notifications"
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors",
                active ? "text-amber-500" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                {isAlerts && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

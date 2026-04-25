import { auth } from "@/auth"
import { redirect } from "next/navigation"
import BottomNav from "@/components/BottomNav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  )
}

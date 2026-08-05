import "server-only"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { cache } from "react"

export const ADMIN_ROLES = ["admin", "developer"] as const

export const verifySession = cache(async () => {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  return {
    isAuth: true,
    userId: session.user.id,
    role: session.user.role,
  }
})

export const requireRole = cache(async (role: string) => {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  if (session.user.role !== role) {
    redirect("/")
  }

  return {
    isAuth: true,
    userId: session.user.id,
    role: session.user.role,
  }
})

export async function requireAdminApi() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!ADMIN_ROLES.includes(session.user.role as typeof ADMIN_ROLES[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return null
}

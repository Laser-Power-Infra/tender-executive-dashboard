import "server-only"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { cache } from "react"

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

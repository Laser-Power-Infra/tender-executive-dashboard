import "server-only"

import { auth } from "@/auth"
import { NextResponse, type NextRequest } from "next/server"

export const ADMIN_ROLES = ["admin", "developer"] as const

// For server actions: they bypass proxy page guards, so each mutating action must check itself.
export async function requireUserAction() {
  const session = await auth()

  if (!session?.user) {
    throw new Error("Unauthorized: Please sign in")
  }

  return session.user
}

/** For server actions of the developer tools. */
export async function requireDeveloperAction() {
  const user = await requireUserAction()
  if (user.role !== "developer") {
    throw new Error("Forbidden: developers only")
  }
  return user
}

/** For server actions open to admins and developers. */
export async function requireAdminAction() {
  const user = await requireUserAction()
  if (!(ADMIN_ROLES as readonly string[]).includes(user.role)) {
    throw new Error("Forbidden: admins only")
  }
  return user
}

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

export async function requireApiKey(req: NextRequest) {
  const key = process.env.EXTERNAL_API_KEY

  const bearer =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const apiKey = req.headers.get("x-api-key") ?? ""

  if (!key || (bearer !== key && apiKey !== key)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}

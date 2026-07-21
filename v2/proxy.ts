import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

const protectedRoutes = ["/admin"]

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isAuthRoute = path.startsWith("/auth")

  if (path.startsWith("/api/")) {
    // Auth endpoints (signup, signin, session, etc.) are public
    if (path.startsWith("/api/auth")) {
      return NextResponse.next()
    }
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      const session = await auth()
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    return NextResponse.next()
  }

  const isProtected = protectedRoutes.some(
    (route) => path === route || path.startsWith(route + "/")
  )

  if (!isProtected && !isAuthRoute) {
    return NextResponse.next()
  }

  const session = await auth()

  if (isProtected && !session?.user) {
    const loginUrl = new URL("/auth/login", req.url)
    loginUrl.searchParams.set("callbackUrl", path)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && session?.user && path === "/auth/login") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)"],
}

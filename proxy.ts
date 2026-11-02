import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

// Developer tools: the pages, and every write to the settings they edit.
const developerRoutes = ["/v2/admin", "/v2/design"]
const developerApiPaths = ["/api/column-mappings", "/api/column-groups", "/api/column-indices", "/api/sop-responsibilities"]
const syncApiPaths = ["/api/sync", "/api/refresh-all"]
const publicApiPaths = ["/api/external", "/api/mcp", "/api/sync/nic","/api/sync-dockets", "/api/sync-quotation", "/api/sync-costing-smartsheet", "/api/sync-bom", "/api/health", "/api/sync-to-merged", "/api/admin/reset-password", "/api/reminder/costing-sheet", "/api/webhook/intelligence", "/api/webhook/ai-relevance", "/api/webhook/automation", "/api/webhook/parsing", "/api/webhook/ingestion", "/api/webhook/feedback", "/api/webhook/result", "/api/webhook/performance-certificate", "/api/webhook/nic-sync"]
const ADMIN_ROLES = ["admin", "developer"]

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isAuthRoute = path.startsWith("/auth")

  if (path === "/") {
    return NextResponse.redirect(new URL("/v2/tenders", req.url))
  }

  if (path.startsWith("/api/")) {
    // Auth endpoints (signup, signin, session, etc.) are public
    if (path.startsWith("/api/auth")) {
      return NextResponse.next()
    }
    if (publicApiPaths.some(p => path.startsWith(p))) {
      return NextResponse.next()
    }
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      const session = await auth()
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (developerApiPaths.some(p => path.startsWith(p)) && session.user.role !== "developer") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      // Sync API routes require admin or developer role
      if (syncApiPaths.some(p => path.startsWith(p))) {
        if (!ADMIN_ROLES.includes(session.user.role)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
      }
    }
    return NextResponse.next()
  }

  const isProtected = developerRoutes.some(
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

  if (isProtected && session?.user?.role !== "developer") {
    return NextResponse.redirect(new URL("/v2/tenders", req.url))
  }

  if (isAuthRoute && session?.user && path === "/auth/login") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)"],
}

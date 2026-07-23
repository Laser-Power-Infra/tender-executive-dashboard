import "server-only"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

type Action = "CREATE" | "UPDATE" | "DELETE" | "GENERATE_CERTIFICATE_PDF"

export async function logActivity(params: {
  action: Action
  tableName: string
  recordId?: string
  referenceNo?: string
  details?: string
}) {
  try {
    const session = await auth()
    const user = session?.user

    await prisma.activityLog.create({
      data: {
        userId: user?.id ?? null,
        userName: user?.name ?? "Unknown",
        userEmail: user?.email ?? "unknown@unknown",
        action: params.action,
        tableName: params.tableName,
        recordId: params.recordId ?? null,
        referenceNo: params.referenceNo ?? null,
        details: params.details ?? null,
      },
    })
  } catch (error) {
    console.error("[ActivityLog] Failed to log activity:", error)
  }
}

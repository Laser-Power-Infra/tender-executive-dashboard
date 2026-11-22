import "server-only"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

// Reads are deliberately not logged - only mutations, plus MCP tool calls so agent use is traceable.
type Action = "CREATE" | "UPDATE" | "DELETE" | "GENERATE_CERTIFICATE_PDF" | "MCP_CALL"

export type LogActivityParams = {
  action: Action
  tableName: string
  recordId?: string
  referenceNo?: string
  details?: string
  // Overrides for callers without an auth session (public webhooks).
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
}

async function createActivityLogRecord(params: LogActivityParams) {
  const session = await auth()
  const user = session?.user

  return prisma.activityLog.create({
    data: {
      userId: params.userId ?? user?.id ?? null,
      userName: params.userName ?? user?.name ?? "Unknown",
      userEmail: params.userEmail ?? user?.email ?? "unknown@unknown",
      action: params.action,
      tableName: params.tableName,
      recordId: params.recordId ?? null,
      referenceNo: params.referenceNo ?? null,
      details: params.details ?? null,
    },
  })
}

export async function logActivity(params: LogActivityParams) {
  try {
    const activity = await createActivityLogRecord(params)

    console.log("[ActivityLog] Activity created", {
      userName: activity.userName,
      userEmail: activity.userEmail,
      action: activity.action,
      tableName: activity.tableName,
      recordId: activity.recordId,
      referenceNo: activity.referenceNo,
    })

    return activity
  } catch (error) {
    console.error("[ActivityLog] Failed to log activity:", error)
  }
}

type MaybePromise<T> = T | Promise<T>

export function withLog<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  getLogParams: (
    result: TResult,
    ...args: TArgs
  ) => MaybePromise<LogActivityParams | null>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const result = await fn(...args)
    try {
      const params = await getLogParams(result, ...args)
      if (params) {
        const activity = await createActivityLogRecord(params)
        console.log("[ActivityLog] Activity created", {
          userName: activity.userName,
          userEmail: activity.userEmail,
          action: activity.action,
          tableName: activity.tableName,
          recordId: activity.recordId,
          referenceNo: activity.referenceNo,
        })
      }
    } catch (error) {
      console.error("[ActivityLog] Failed to log activity:", error)
    }
    return result
  }
}

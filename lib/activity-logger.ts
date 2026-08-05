import "server-only"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

type Action = "CREATE" | "UPDATE" | "DELETE" | "GENERATE_CERTIFICATE_PDF" | "READ"

export type LogActivityParams = {
  action: Action
  tableName: string
  recordId?: string
  referenceNo?: string
  details?: string
}

export async function logActivity(params: LogActivityParams) {
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
        await logActivity(params)
      }
    } catch (error) {
      console.error("[ActivityLog] Failed to log activity:", error)
    }
    return result
  }
}

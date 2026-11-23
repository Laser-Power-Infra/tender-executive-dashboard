import { NextRequest } from "next/server";
import { requireBearerAuth, type AuthInfo } from "@modelcontextprotocol/server";
import { requireApiKey } from "@/lib/dal";
import { logActivity } from "@/lib/activity-logger";
import { mcpHandler } from "@/lib/mcp/server";
import { mcpUrl, resourceMetadataUrl, verifyAccessToken, type McpCaller } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

async function handle(req: NextRequest) {
  // Scripts keep using EXTERNAL_API_KEY; agents (Claude, ChatGPT) sign in with OAuth.
  let authInfo: AuthInfo | undefined;
  if (await requireApiKey(req)) {
    const gate = requireBearerAuth({
      verifier: { verifyAccessToken },
      expectedResource: mcpUrl(),
      resourceMetadataUrl: resourceMetadataUrl(),
    });
    const result = await gate(req);
    if (result instanceof Response) return result;
    authInfo = result;
  }

  const message = req.method === "POST" ? await req.clone().json().catch(() => null) : null;
  const response = await mcpHandler.fetch(req, { authInfo });

  // Tools only read, so each tool call is logged as the trace of who asked what, through which agent.
  if (message?.method === "tools/call") {
    const caller = authInfo?.extra?.caller as McpCaller | undefined;
    await logActivity({
      action: "MCP_CALL",
      tableName: "MCP",
      recordId: message.params?.name,
      referenceNo: caller?.clientName ?? "API key",
      // The Activity page shows no Record ID column, so the tool name leads the details.
      details: `${message.params?.name} ${JSON.stringify(message.params?.arguments ?? {})}`,
      userId: caller?.id ?? null,
      userName: caller ? caller.name ?? caller.email : "API key",
      userEmail: caller?.email ?? "",
    });
  }
  return response;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

import { NextRequest, NextResponse } from "next/server";
import { OAuthError } from "@modelcontextprotocol/server";
import { exchange } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const params = Object.fromEntries(
    [...(form?.entries() ?? [])].map(([k, v]) => [k, typeof v === "string" ? v : undefined]),
  );
  try {
    return NextResponse.json(await exchange(params), { headers: noStore });
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json(error.toResponseObject(), { status: 400, headers: noStore });
    }
    console.error("[oauth/token]", error);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: noStore });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAllowedRedirect } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

// RFC 7591 dynamic client registration: Claude and ChatGPT call this once per connector.
const body = z.object({
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
});

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "redirect_uris is required" },
      { status: 400 },
    );
  }
  const { client_name, redirect_uris } = parsed.data;
  if (!redirect_uris.every(isAllowedRedirect)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "Redirect host is not allowed" },
      { status: 400 },
    );
  }

  const client = await prisma.oAuthClient.create({
    data: { name: client_name ?? "Unnamed client", redirectUris: redirect_uris },
  });

  return NextResponse.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}

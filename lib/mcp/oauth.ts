import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type AuthMetadataOptions,
} from "@modelcontextprotocol/server";
import { prisma } from "@/lib/prisma";

// Our app is the OAuth server MCP agents talk to; Google is only the login step
// inside /oauth/authorize (the normal NextAuth sign-in).

const CODE_TTL = 60;
const ACCESS_TTL = 60 * 60;
const REFRESH_TTL = 30 * 24 * 60 * 60;

// The public https origin. Behind the reverse proxy req.url carries the internal host.
function origin() {
  const url = process.env.MCP_PUBLIC_URL;
  if (!url) throw new Error("MCP_PUBLIC_URL is not set");
  return url.replace(/\/$/, "");
}

export const mcpUrl = () => new URL(`${origin()}/api/mcp`);
export const resourceMetadataUrl = () => getOAuthProtectedResourceMetadataUrl(mcpUrl());

export const metadataOptions = (): AuthMetadataOptions => ({
  resourceServerUrl: mcpUrl(),
  resourceName: "Tender Dashboard",
  scopesSupported: ["mcp"],
  oauthMetadata: {
    issuer: origin(),
    authorization_endpoint: `${origin()}/oauth/authorize`,
    token_endpoint: `${origin()}/api/oauth/token`,
    registration_endpoint: `${origin()}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  },
});

/** GET handler for both /.well-known discovery documents. */
export const metadataRoute = (req: Request) =>
  oauthMetadataResponse(req, metadataOptions()) ?? new Response(null, { status: 404 });

const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

// Agents may only send codes back to these. Open registration plus this list means a
// stranger's client cannot collect a code for one of our users.
const ALLOWED_HOSTS = ["claude.ai", "claude.com", "chatgpt.com"];
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

export function isAllowedRedirect(uri: string) {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:" && ALLOWED_HOSTS.includes(url.hostname)) return true;
    // Claude Code and MCP Inspector listen on a local port.
    return url.protocol === "http:" && LOOPBACK.includes(url.hostname);
  } catch {
    return false;
  }
}

/** A bad /oauth/authorize request; its message is safe to show the visitor. */
export class AuthorizeError extends Error {}

/** The /oauth/authorize query, checked. */
export async function checkAuthorizeRequest(p: Record<string, string | undefined>) {
  const client = p.client_id
    ? await prisma.oAuthClient.findUnique({ where: { id: p.client_id } })
    : null;
  if (!client) throw new AuthorizeError("Unknown client. Remove the connector and add it again.");
  if (!p.redirect_uri || !client.redirectUris.includes(p.redirect_uri)) {
    throw new AuthorizeError("The redirect address does not match this client.");
  }
  if (p.response_type !== "code") throw new AuthorizeError("Only response_type=code is supported.");
  if (!p.code_challenge || p.code_challenge_method !== "S256") {
    throw new AuthorizeError("PKCE with S256 is required.");
  }
  if (p.resource && !sameResource(p.resource)) {
    throw new AuthorizeError("This server cannot grant that resource.");
  }
  return {
    client,
    redirectUri: p.redirect_uri,
    codeChallenge: p.code_challenge,
    state: p.state,
  };
}

const sameResource = (resource: string) =>
  resource.replace(/#.*$/, "").replace(/\/$/, "") === mcpUrl().href.replace(/\/$/, "");

async function issue(
  kind: "code" | "access" | "refresh",
  ttl: number,
  data: { clientId: string; userId: string; redirectUri?: string; codeChallenge?: string },
) {
  const secret = randomBytes(32).toString("base64url");
  await prisma.oAuthGrant.create({
    data: { ...data, kind, hash: sha256(secret), expiresAt: new Date(Date.now() + ttl * 1000) },
  });
  return secret;
}

export const issueCode = (data: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
}) => issue("code", CODE_TTL, data);

const invalidGrant = () => new OAuthError(OAuthErrorCode.InvalidGrant, "Invalid, expired or used grant");

/** Deletes the code or refresh token as it is read, so each works once. */
async function take(secret: string | undefined, kind: "code" | "refresh") {
  if (!secret) throw invalidGrant();
  const grant = await prisma.oAuthGrant
    .delete({ where: { hash: sha256(secret) }, include: { user: { select: { active: true } } } })
    .catch(() => null);
  if (!grant || grant.kind !== kind || grant.expiresAt < new Date() || !grant.user.active) {
    throw invalidGrant();
  }
  return grant;
}

async function issueTokens(clientId: string, userId: string) {
  // Housekeeping: expired codes and tokens are useless, drop them as new ones go out.
  await prisma.oAuthGrant.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return {
    access_token: await issue("access", ACCESS_TTL, { clientId, userId }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: await issue("refresh", REFRESH_TTL, { clientId, userId }),
    scope: "mcp",
  };
}

/** The token endpoint's grants. Throws OAuthError. */
export async function exchange(p: Record<string, string | undefined>) {
  if (p.grant_type === "authorization_code") {
    const code = await take(p.code, "code");
    if (
      code.clientId !== p.client_id ||
      code.redirectUri !== p.redirect_uri ||
      !p.code_verifier ||
      sha256(p.code_verifier) !== code.codeChallenge
    ) {
      throw invalidGrant();
    }
    return issueTokens(code.clientId, code.userId);
  }
  if (p.grant_type === "refresh_token") {
    // Rotation: the old refresh token is gone once used.
    const refresh = await take(p.refresh_token, "refresh");
    if (refresh.clientId !== p.client_id) throw invalidGrant();
    return issueTokens(refresh.clientId, refresh.userId);
  }
  throw new OAuthError(OAuthErrorCode.UnsupportedGrantType, "Unsupported grant_type");
}

export type McpCaller = { id: string; name: string | null; email: string; clientName: string };

/** Bearer verifier for /api/mcp. The SDK rejects the token once expiresAt passes. */
export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const grant = await prisma.oAuthGrant.findUnique({
    where: { hash: sha256(token) },
    include: {
      client: { select: { name: true } },
      user: { select: { id: true, name: true, email: true, active: true } },
    },
  });
  // Deactivating a user cuts off their agents on the next call.
  if (!grant || grant.kind !== "access" || !grant.user.active) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired token");
  }
  const caller: McpCaller = {
    id: grant.user.id,
    name: grant.user.name,
    email: grant.user.email,
    clientName: grant.client.name,
  };
  return {
    token,
    clientId: grant.clientId,
    scopes: ["mcp"],
    expiresAt: Math.floor(grant.expiresAt.getTime() / 1000),
    resource: mcpUrl(),
    extra: { caller },
  };
}

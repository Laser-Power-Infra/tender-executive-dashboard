import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireUserAction } from "@/lib/dal";
import { AuthorizeError, checkAuthorizeRequest, issueCode } from "@/lib/mcp/oauth";
import { AuthFrame } from "@/components/v2/auth/auth-frame";
import { Button } from "@/components/v2/ui/button";

// OAuth consent for MCP agents (Claude, ChatGPT). Sign-in itself is the normal
// login page, Google included; this page only asks the signed-in user to allow the agent.

type Params = Record<string, string>;

const stringsOnly = (entries: Iterable<[string, unknown]>): Params =>
  Object.fromEntries([...entries].filter((e): e is [string, string] => typeof e[1] === "string"));

async function decide(formData: FormData) {
  "use server";
  const params = stringsOnly(formData.entries());
  const user = await requireUserAction();
  // Hidden fields come back from the browser: check them again.
  const request = await checkAuthorizeRequest(params);

  const target = new URL(request.redirectUri);
  if (params.decision === "allow") {
    const code = await issueCode({
      clientId: request.client.id,
      userId: user.id,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
    });
    target.searchParams.set("code", code);
  } else {
    target.searchParams.set("error", "access_denied");
  }
  if (request.state) target.searchParams.set("state", request.state);
  redirect(target.href);
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = stringsOnly(Object.entries(await searchParams));

  let request: Awaited<ReturnType<typeof checkAuthorizeRequest>>;
  try {
    request = await checkAuthorizeRequest(params);
  } catch (error) {
    // Anything else (a database error) must not show its details to a signed-out visitor.
    if (!(error instanceof AuthorizeError)) throw error;
    return (
      <AuthFrame title="Cannot connect" hint={error.message}>
        {null}
      </AuthFrame>
    );
  }

  const session = await auth();
  if (!session?.user) {
    const back = `/oauth/authorize?${new URLSearchParams(params)}`;
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  return (
    <AuthFrame
      title={`Connect ${request.client.name}`}
      hint={`${request.client.name} (${new URL(request.redirectUri).host}) wants to read the tender dashboard as ${session.user.email}.`}
    >
      <form action={decide} className="flex gap-2">
        {Object.entries(params).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit" name="decision" value="allow" variant="primary">
          Allow
        </Button>
        <Button type="submit" name="decision" value="deny">
          Cancel
        </Button>
      </form>
    </AuthFrame>
  );
}

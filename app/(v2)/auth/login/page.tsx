import { AuthFrame } from "@/components/v2/auth/auth-frame";
import { LoginForm } from "@/components/v2/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <AuthFrame title="Sign in" hint="Use the account an admin created for you.">
      <LoginForm
        callbackUrl={typeof callbackUrl === "string" ? callbackUrl : "/"}
        googleEnabled={!!process.env.AUTH_GOOGLE_ID}
        googleError={typeof error === "string" && error !== "CredentialsSignin" ? error : undefined}
      />
    </AuthFrame>
  );
}

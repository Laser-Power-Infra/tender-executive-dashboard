"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { authenticate, googleSignIn } from "@/actions/auth";
import { Button } from "@/components/v2/ui/button";
import { Field, Input } from "@/components/v2/ui/field";
import { FormError, PasswordInput } from "./auth-frame";

export function LoginForm({
  callbackUrl,
  googleEnabled,
  googleError,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  /** Auth.js error code from a failed Google sign-in. */
  googleError?: string;
}) {
  // The action returns the URL to open, or one of two error strings.
  const [state, formAction, pending] = useActionState(authenticate, undefined);
  // Controlled, so a failed attempt does not clear it when the form resets.
  const [email, setEmail] = useState("");

  const wrongCredentials = state?.startsWith("Invalid");
  const failed = wrongCredentials || state?.startsWith("Something");
  const signedIn = !!state && !failed;

  useEffect(() => {
    // A document load: the session cookie is new and the target may be a v1 page.
    if (signedIn) window.location.href = state;
  }, [signedIn, state]);

  return (
    <>
      {googleEnabled && (
        <form action={googleSignIn} className="mb-5 flex flex-col gap-3">
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          {googleError && (
            <FormError>
              {googleError === "AccessDenied"
                ? "This Google account has no access. Ask an admin."
                : "Could not sign in with Google. Try again."}
            </FormError>
          )}
          <GoogleButton />
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-3" aria-hidden>
            <span className="flex-1 border-t" />
            or
            <span className="flex-1 border-t" />
          </div>
        </form>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="redirectTo" value={callbackUrl} />
        <Field label="Email">
          <Input
            name="email"
            type="email"
            autoComplete="email"
            // Focus would pull the eye past the Google button above.
            autoFocus={!googleEnabled}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
          />
        </Field>
        <Field label="Password">
          <PasswordInput name="password" autoComplete="current-password" required />
        </Field>

        {failed && (
          <FormError>
            {wrongCredentials
              ? "Email or password is wrong."
              : "Could not sign in. Try again."}
          </FormError>
        )}

        <Button
          type="submit"
          variant="primary"
          loading={pending || signedIn}
          className="mt-1 h-9 w-full"
        >
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-ink-3">
        No account? Ask an admin to create one for you.
      </p>
    </>
  );
}

// Inside the form, so useFormStatus sees it: the trip to Google takes a moment.
function GoogleButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} icon={<GoogleLogo />} className="h-9 w-full">
      Sign in with Google
    </Button>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-3.5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

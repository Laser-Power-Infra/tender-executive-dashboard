"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/ui/button";
import { Field, Input } from "@/components/v2/ui/field";
import { FormError, PasswordInput } from "./auth-frame";

const EMPTY = { name: "", email: "", mobile: "", password: "" };

export function SignupForm() {
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Account not created. Try again.");
        return;
      }
      toast.success(`Account created for ${values.email}`);
      // Stay here: an admin often adds several people in one go.
      setValues(EMPTY);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Name (optional)">
        <Input
          autoComplete="off"
          autoFocus
          value={values.name}
          onChange={set("name")}
          className="h-9"
        />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          autoComplete="off"
          required
          value={values.email}
          onChange={set("email")}
          className="h-9"
        />
      </Field>
      <Field label="Mobile (WhatsApp)">
        <Input
          type="tel"
          autoComplete="off"
          required
          placeholder="9876543210"
          value={values.mobile}
          onChange={set("mobile")}
          className="h-9"
        />
      </Field>
      <Field label="Password (6 characters or more)">
        <PasswordInput
          autoComplete="new-password"
          required
          minLength={6}
          value={values.password}
          onChange={set("password")}
        />
      </Field>

      {error && <FormError>{error}</FormError>}

      <Button
        type="submit"
        variant="primary"
        loading={saving}
        className="mt-1 h-9 w-full"
      >
        Create account
      </Button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { signIn } from "../actions";
import { useFormAction } from "@/hooks/use-form-action";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert, FormMessage } from "@/components/ui/alert";

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const { state, pending, onSubmit } = useFormAction(signIn);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Log in</h1>
        <p className="mt-1 text-sm text-muted">Owners and managers log in with email.</p>
      </div>
      {linkError && <Alert tone="warning">That link is invalid or has expired. Please try again.</Alert>}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:text-primary-hover">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pending={pending} size="lg" className="w-full" pendingText="Logging in…">
        Log in
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        New restaurant?{" "}
        <Link href="/signup" className="font-medium text-primary hover:text-primary-hover">
          Create an account
        </Link>
      </p>
    </form>
  );
}

"use client";

import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { useFormAction } from "@/hooks/use-form-action";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/alert";

export default function ForgotPasswordPage() {
  const { state, pending, onSubmit } = useFormAction(requestPasswordReset);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">We&apos;ll email you a link to choose a new password.</p>
      </div>
      <FormMessage state={state} />
      {!state.ok && (
        <>
          <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
          </Field>
          <SubmitButton pending={pending} size="lg" className="w-full" pendingText="Sending…">
            Send reset link
          </SubmitButton>
        </>
      )}
      <Link href="/login" className="block text-center text-sm font-medium text-primary">
        Back to log in
      </Link>
    </form>
  );
}

"use client";

import { updatePassword } from "../actions";
import { useFormAction } from "@/hooks/use-form-action";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/alert";

export default function ResetPasswordPage() {
  const { state, pending, onSubmit } = useFormAction(updatePassword);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pending={pending} size="lg" className="w-full">
        Save password
      </SubmitButton>
    </form>
  );
}

"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

/**
 * A submit button that shows a spinner while saving.
 * Pass `pending` when using the useFormAction hook; otherwise it reads the
 * parent <form action={…}> status automatically.
 */
export function SubmitButton({
  children,
  pendingText,
  pending: pendingProp,
  ...props
}: ButtonProps & { pendingText?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}

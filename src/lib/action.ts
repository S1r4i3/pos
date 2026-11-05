// Shared shape returned by every form Server Action, so forms can show
// a success message, a general error, or an error under a specific field.
import type { z } from "zod";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialState: ActionState = {};

/** Turn a failed zod check into ActionState with per-field messages. */
export function fromZodError(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { error: "Please fix the highlighted fields.", fieldErrors };
}

/** Friendly text for common database errors. */
export function dbErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "That already exists — please use a different value.";
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "23503") return "This is still being used elsewhere, so it can't be changed.";
  if (error.code === "23514") return "One of the values isn't allowed. Please check and try again.";
  return error.message;
}

/** Read a checkbox from FormData ("on" when ticked). */
export function checkbox(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

/** Read a trimmed string; empty → null. */
export function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/env";
import { fromZodError, type ActionState } from "@/lib/action";

/** Only allow redirects to our own pages (never to another website). */
function safeNext(value: FormDataEntryValue | null, fallback = "/dashboard") {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

async function siteOrigin() {
  const h = await headers();
  return h.get("origin") ?? SITE_URL;
}

const email = z.email("Enter a valid email address").trim().toLowerCase();
const password = z.string().min(8, "Use at least 8 characters").max(72, "Too long");

// ---------- Log in ----------
export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "Enter your password") })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first — check your inbox for the link." };
    }
    if (error.code === "invalid_credentials") return { error: "Wrong email or password." };
    return { error: error.message };
  }
  redirect(safeNext(formData.get("next")));
}

// ---------- Sign up (new restaurant owner) ----------
export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      fullName: z.string().trim().min(2, "Enter your name").max(80),
      email,
      password,
      confirm: z.string(),
    })
    .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" })
    .safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/onboarding`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists") return { error: "An account with this email already exists. Try logging in." };
    if (error.code === "weak_password") return { fieldErrors: { password: [error.message] }, error: "Choose a stronger password." };
    return { error: error.message };
  }

  // If "Confirm email" is OFF in Supabase, the user is logged in straight away.
  if (data.session) redirect("/onboarding");

  return {
    ok: true,
    message: `We've sent a confirmation link to ${parsed.data.email}. Open it to continue setting up your restaurant.`,
  };
}

// ---------- Forgot password ----------
export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  // Same message whether or not the email exists, so nobody can test which emails have accounts.
  return { ok: true, message: "If that email has an account, a reset link is on its way. Check your inbox." };
}

// ---------- Set a new password (after clicking the reset link) ----------
export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "That's your current password — choose a new one." };
    return { error: "Your reset link has expired. Please request a new one." };
  }
  redirect("/dashboard");
}

// ---------- Log out ----------
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

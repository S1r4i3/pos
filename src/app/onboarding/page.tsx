import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { getAppContext, getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your restaurant" };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (await getAppContext()) redirect("/dashboard");

  // Pre-fill the owner's name from sign-up
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const fullName = (data.user?.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
            <UtensilsCrossed className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-xl font-bold tracking-tight">RestoPOS</span>
        </div>
        <form action={signOut}>
          <button type="submit" className="h-11 px-2 text-sm text-muted hover:text-text">
            Log out ({user.email})
          </button>
        </form>
      </div>
      <h1 className="text-2xl font-semibold">Set up your restaurant</h1>
      <p className="mt-1 text-sm text-muted">
        This takes a minute. You can change everything later in Settings, and add more outlets anytime.
      </p>
      <div className="mt-6">
        <OnboardingForm defaultOwnerName={fullName} />
      </div>
    </main>
  );
}

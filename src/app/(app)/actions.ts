"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/session";
import { OUTLET_COOKIE } from "@/lib/env";

/** Remember which outlet the user is working in (only outlets they may access). */
export async function switchOutlet(outletId: string) {
  const ctx = await requireContext();
  if (!ctx.outlets.some((o) => o.id === outletId)) {
    return { error: "You don't have access to that outlet." };
  }
  (await cookies()).set(OUTLET_COOKIE, outletId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

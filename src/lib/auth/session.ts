import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OUTLET_COOKIE } from "@/lib/env";
import { can, type Permission, type Role } from "@/lib/auth/roles";
import type { OutletSummary } from "@/types/db";

export type SessionUser = { id: string; email: string | null };

export type AppContext = {
  user: SessionUser;
  staff: { id: string; fullName: string };
  org: { id: string; name: string };
  role: Role;
  /** Outlets this user may open (owner: all active outlets of the business) */
  outlets: OutletSummary[];
  /** The outlet currently selected in the outlet switcher */
  outlet: OutletSummary | null;
};

const OUTLET_FIELDS = "id, org_id, name, code, city, logo_url, day_start_hour, is_active";

/** The verified logged-in user, or null. Cached for the current request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
});

/**
 * Everything a screen needs to know about "who is using the app":
 * user, staff record, role, business and current outlet.
 * Returns null when the user hasn't set up / joined a restaurant yet.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();

  const [{ data: memberships }, { data: outletRows }] = await Promise.all([
    supabase
      .from("staff_members")
      .select("id, org_id, full_name, role, organizations(id, name)")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase.from("outlets").select(OUTLET_FIELDS).eq("is_active", true).order("created_at"),
  ]);

  type MembershipRow = {
    id: string;
    org_id: string;
    full_name: string;
    role: Role;
    organizations: { id: string; name: string } | null;
  };
  const rows = (memberships ?? []) as unknown as MembershipRow[];
  if (rows.length === 0) return null;

  const outlets = (outletRows ?? []) as OutletSummary[];
  const wanted = (await cookies()).get(OUTLET_COOKIE)?.value;
  const outlet = outlets.find((o) => o.id === wanted) ?? outlets[0] ?? null;

  const membership = (outlet && rows.find((m) => m.org_id === outlet.org_id)) || rows[0];

  return {
    user,
    staff: { id: membership.id, fullName: membership.full_name },
    org: { id: membership.org_id, name: membership.organizations?.name ?? "" },
    role: membership.role,
    outlets: outlets.filter((o) => o.org_id === membership.org_id),
    outlet,
  };
});

/** Use at the top of every logged-in page/action. Redirects if not allowed. */
export async function requireContext(): Promise<AppContext & { outlet: OutletSummary }> {
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await getAppContext();
  if (!ctx) redirect("/onboarding");
  if (!ctx.outlet) redirect("/no-access");
  return ctx as AppContext & { outlet: OutletSummary };
}

/** Like requireContext, but also checks the role has a permission. */
export async function requirePermission(permission: Permission) {
  const ctx = await requireContext();
  if (!can(ctx.role, permission)) redirect("/dashboard?denied=1");
  return ctx;
}

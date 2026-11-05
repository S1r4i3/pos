import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Outlet } from "@/types/db";
import { BusinessForm } from "./business-form";
import { OutletList } from "./outlet-list";

export const metadata: Metadata = { title: "Business & outlets" };

export default async function OutletsPage() {
  const ctx = await requirePermission("manageOutlets");
  const supabase = await createClient();
  const [{ data: org }, { data: outlets }] = await Promise.all([
    supabase.from("organizations").select("id, name, owner_id, phone, email").eq("id", ctx.org.id).single(),
    supabase
      .from("outlets")
      .select("id, name, code, city, state, gstin, outlet_type, is_active")
      .eq("org_id", ctx.org.id)
      .order("created_at"),
  ]);

  return (
    <div className="space-y-6">
      {org && <BusinessForm org={org as Organization} />}
      <OutletList
        outlets={(outlets ?? []) as Pick<Outlet, "id" | "name" | "code" | "city" | "state" | "gstin" | "outlet_type" | "is_active">[]}
        currentOutletId={ctx.outlet.id}
      />
    </div>
  );
}

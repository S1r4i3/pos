import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { TaxGroup } from "@/types/db";
import { TaxGroups } from "./tax-groups";

export const metadata: Metadata = { title: "GST & taxes" };

export default async function TaxesPage() {
  const ctx = await requirePermission("manageTaxes");
  const supabase = await createClient();
  const { data } = await supabase
    .from("tax_groups")
    .select("id, org_id, name, cgst_rate, sgst_rate, total_rate, is_default, is_active")
    .eq("org_id", ctx.org.id)
    .order("total_rate");

  const groups = (data ?? []).map((g) => ({
    ...g,
    cgst_rate: Number(g.cgst_rate),
    sgst_rate: Number(g.sgst_rate),
    total_rate: Number(g.total_rate),
  })) as TaxGroup[];

  return <TaxGroups groups={groups} />;
}

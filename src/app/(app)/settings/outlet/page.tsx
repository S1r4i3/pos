import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Outlet } from "@/types/db";
import { OutletForm } from "./outlet-form";
import { LogoUploader } from "./logo-uploader";

export const metadata: Metadata = { title: "Outlet settings" };

export default async function OutletSettingsPage() {
  const ctx = await requirePermission("manageOutlet");
  const supabase = await createClient();
  const { data } = await supabase.from("outlets").select("*").eq("id", ctx.outlet.id).single();
  if (!data) notFound();
  const outlet = {
    ...data,
    service_charge_rate: Number(data.service_charge_rate),
    day_start_hour: Number(data.day_start_hour),
    printer_paper_width: Number(data.printer_paper_width),
  } as Outlet;

  return (
    <div className="space-y-6">
      <LogoUploader orgId={ctx.org.id} outletId={outlet.id} currentUrl={outlet.logo_url} />
      {/* key: reset the form when switching outlets */}
      <OutletForm key={outlet.id} outlet={outlet} />
    </div>
  );
}

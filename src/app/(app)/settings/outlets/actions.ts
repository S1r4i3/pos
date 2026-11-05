"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { checkbox, dbErrorMessage, fromZodError, text, type ActionState } from "@/lib/action";
import { stateByCode } from "@/lib/india";

// ---------- Business name & contact ----------
const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name").max(120),
  phone: z.string().regex(/^[0-9+\- ]{8,15}$/, "Enter a valid phone number").nullable(),
  email: z.email("Enter a valid email").nullable(),
});

export async function updateBusiness(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requirePermission("manageOutlets");
  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(parsed.data).eq("id", ctx.org.id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Business details saved." };
}

// ---------- Add an outlet ----------
const outletSchema = z.object({
  name: z.string().trim().min(2, "Enter the outlet name").max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, "1–4 letters or numbers"),
  outlet_type: z.enum(["restaurant", "cafe", "cloud_kitchen", "qsr", "bar", "other"]),
  city: z.string().max(80).nullable(),
  state_code: z.string().regex(/^[0-9]{2}$/, "Select a state"),
});

export async function createOutlet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requirePermission("manageOutlets");
  const parsed = outletSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    outlet_type: formData.get("outlet_type"),
    city: text(formData, "city"),
    state_code: formData.get("state_code"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();

  // Optionally copy billing settings from the outlet currently selected
  let copied = {};
  if (checkbox(formData, "copy_settings")) {
    const { data: source } = await supabase
      .from("outlets")
      .select("prices_include_tax, service_charge_enabled, service_charge_rate, day_start_hour, receipt_footer, printer_paper_width, logo_url")
      .eq("id", ctx.outlet.id)
      .single();
    if (source) copied = source;
  }

  const { data: outlet, error } = await supabase
    .from("outlets")
    .insert({
      ...copied,
      ...parsed.data,
      org_id: ctx.org.id,
      state: stateByCode(parsed.data.state_code)?.name ?? null,
    })
    .select("id")
    .single();

  if (error || !outlet) {
    if (error?.code === "23505") {
      return { error: "Please fix the highlighted fields.", fieldErrors: { code: ["Another outlet already uses this code"] } };
    }
    return { error: error ? dbErrorMessage(error) : "Couldn't create the outlet." };
  }

  // Every outlet starts with one seating area
  await supabase.from("areas").insert({ org_id: ctx.org.id, outlet_id: outlet.id, name: "Main Hall" });

  revalidatePath("/", "layout");
  return { ok: true, message: `${parsed.data.name} added. Switch to it from the outlet menu to edit its details.` };
}

// ---------- Turn an outlet on/off ----------
export async function setOutletActive(outletId: string, active: boolean): Promise<ActionState> {
  const ctx = await requirePermission("manageOutlets");
  const supabase = await createClient();

  if (!active) {
    const { count } = await supabase
      .from("outlets")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.org.id)
      .eq("is_active", true);
    if ((count ?? 0) <= 1) return { error: "You need at least one active outlet." };
  }

  const { error } = await supabase.from("outlets").update({ is_active: active }).eq("id", outletId).eq("org_id", ctx.org.id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: active ? "Outlet turned on." : "Outlet turned off. Its data is kept." };
}

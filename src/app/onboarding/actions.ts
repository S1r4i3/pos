"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/session";
import { fromZodError, text, type ActionState } from "@/lib/action";
import { stateByCode } from "@/lib/india";
import { validateGstin } from "@/lib/gstin";

const schema = z.object({
  orgName: z.string().trim().min(2, "Enter your business name").max(120),
  ownerName: z.string().trim().min(2, "Enter your name").max(80),
  outletName: z.string().trim().min(2, "Enter the outlet name").max(120),
  outletCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,4}$/, "1–4 letters or numbers, e.g. BH1"),
  phone: z
    .string()
    .regex(/^[6-9][0-9]{9}$/, "Enter a 10-digit mobile number")
    .nullable(),
  city: z.string().max(80).nullable(),
  stateCode: z.string().regex(/^[0-9]{2}$/, "Select your state"),
  gstin: z.string().toUpperCase().nullable(),
  fssai: z
    .string()
    .regex(/^[0-9]{14}$/, "FSSAI licence number is 14 digits")
    .nullable(),
});

export async function createRestaurant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // NOTE: don't use getAppContext() here — it's cached for this request, and
  // the dashboard we redirect to must see the newly created restaurant.
  const { count } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if ((count ?? 0) > 0) redirect("/dashboard");

  const parsed = schema.safeParse({
    orgName: formData.get("orgName"),
    ownerName: formData.get("ownerName"),
    outletName: formData.get("outletName"),
    outletCode: formData.get("outletCode"),
    phone: text(formData, "phone"),
    city: text(formData, "city"),
    stateCode: formData.get("stateCode"),
    gstin: text(formData, "gstin"),
    fssai: text(formData, "fssai"),
  });
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;

  if (d.gstin) {
    const check = validateGstin(d.gstin, d.stateCode);
    if (!check.ok) return { error: "Please fix the highlighted fields.", fieldErrors: { gstin: [check.reason] } };
  }

  const { error } = await supabase.rpc("create_organization", {
    p_org_name: d.orgName,
    p_owner_name: d.ownerName,
    p_outlet_name: d.outletName,
    p_outlet_code: d.outletCode,
    p_phone: d.phone,
    p_city: d.city,
    p_state: stateByCode(d.stateCode)?.name ?? null,
    p_state_code: d.stateCode,
    p_gstin: d.gstin,
    p_fssai_no: d.fssai,
  });
  if (error) {
    if (error.message.includes("already has a restaurant")) redirect("/dashboard");
    return { error: error.message };
  }
  redirect("/dashboard?welcome=1");
}

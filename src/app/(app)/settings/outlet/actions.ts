"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/env";
import { checkbox, dbErrorMessage, fromZodError, text, type ActionState } from "@/lib/action";
import { stateByCode } from "@/lib/india";
import { validateGstin } from "@/lib/gstin";

const optional = (schema: z.ZodString) => schema.nullable();

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter the outlet name").max(120),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, "1–4 letters or numbers"),
    outlet_type: z.enum(["restaurant", "cafe", "cloud_kitchen", "qsr", "bar", "other"]),
    address_line1: optional(z.string().max(200)),
    address_line2: optional(z.string().max(200)),
    city: optional(z.string().max(80)),
    state_code: optional(z.string().regex(/^[0-9]{2}$/, "Select a state")),
    pincode: optional(z.string().regex(/^[1-9][0-9]{5}$/, "PIN code is 6 digits")),
    phone: optional(z.string().regex(/^[0-9+\- ]{8,15}$/, "Enter a valid phone number")),
    email: z.email("Enter a valid email").nullable(),
    gstin: optional(z.string().toUpperCase()),
    fssai_no: optional(z.string().regex(/^[0-9]{14}$/, "FSSAI licence number is 14 digits")),
    prices_include_tax: z.boolean(),
    service_charge_enabled: z.boolean(),
    service_charge_rate: z.coerce.number().min(0, "Can't be negative").max(20, "Maximum 20%"),
    day_start_hour: z.coerce.number().int().min(0).max(23),
    receipt_header: optional(z.string().max(300)),
    receipt_footer: optional(z.string().max(300)),
    printer_paper_width: z.coerce.number().refine((v) => v === 58 || v === 80, "Choose 58 or 80 mm"),
  })
  .superRefine((d, ctx) => {
    if (d.gstin) {
      const check = validateGstin(d.gstin, d.state_code);
      if (!check.ok) ctx.addIssue({ code: "custom", path: ["gstin"], message: check.reason });
    }
    if (d.service_charge_enabled && d.service_charge_rate <= 0) {
      ctx.addIssue({ code: "custom", path: ["service_charge_rate"], message: "Enter a rate, e.g. 5" });
    }
  });

export async function updateOutlet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requirePermission("manageOutlet");
  const outletId = String(formData.get("outletId") ?? "");
  if (!ctx.outlets.some((o) => o.id === outletId)) return { error: "You can't edit this outlet." };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    outlet_type: formData.get("outlet_type"),
    address_line1: text(formData, "address_line1"),
    address_line2: text(formData, "address_line2"),
    city: text(formData, "city"),
    state_code: text(formData, "state_code"),
    pincode: text(formData, "pincode"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    gstin: text(formData, "gstin"),
    fssai_no: text(formData, "fssai_no"),
    prices_include_tax: checkbox(formData, "prices_include_tax"),
    service_charge_enabled: checkbox(formData, "service_charge_enabled"),
    service_charge_rate: formData.get("service_charge_rate") || 0,
    day_start_hour: formData.get("day_start_hour"),
    receipt_header: text(formData, "receipt_header"),
    receipt_footer: text(formData, "receipt_footer"),
    printer_paper_width: formData.get("printer_paper_width"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("outlets")
    .update({
      ...d,
      state: stateByCode(d.state_code)?.name ?? null,
      service_charge_rate: d.service_charge_enabled ? d.service_charge_rate : 0,
    })
    .eq("id", outletId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Please fix the highlighted fields.", fieldErrors: { code: ["Another outlet already uses this code"] } };
    }
    return { error: dbErrorMessage(error) };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Outlet details saved." };
}

/** Save (or remove) the logo URL after the browser uploaded the image to Storage. */
export async function setOutletLogo(outletId: string, logoUrl: string | null): Promise<ActionState> {
  const ctx = await requirePermission("manageOutlet");
  if (!ctx.outlets.some((o) => o.id === outletId)) return { error: "You can't edit this outlet." };

  // Only accept images stored in our own bucket, inside this business's folder
  const allowedPrefix = `${SUPABASE_URL}/storage/v1/object/public/media/${ctx.org.id}/`;
  if (logoUrl !== null && !logoUrl.startsWith(allowedPrefix)) {
    return { error: "Invalid image location." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("outlets").update({ logo_url: logoUrl }).eq("id", outletId);
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true, message: logoUrl ? "Logo updated." : "Logo removed." };
}

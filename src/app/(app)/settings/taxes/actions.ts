"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fromZodError, type ActionState } from "@/lib/action";

const schema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Enter a name, e.g. GST 5%").max(40),
  rate: z.coerce
    .number({ message: "Enter the GST %" })
    .min(0, "Can't be negative")
    .max(40, "Too high")
    .refine((v) => Number.isInteger(v * 4), "Use a rate like 5 or 18"),
});

/** Create or update a GST slab. CGST and SGST are each half of the GST rate. */
export async function saveTaxGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requirePermission("manageTaxes");
  const parsed = schema.safeParse({
    id: formData.get("id") || null,
    name: formData.get("name"),
    rate: formData.get("rate"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const { id, name, rate } = parsed.data;
  const half = Math.round((rate / 2) * 100) / 100;
  const supabase = await createClient();

  const { error } = id
    ? await supabase.from("tax_groups").update({ name, cgst_rate: half, sgst_rate: half }).eq("id", id).eq("org_id", ctx.org.id)
    : await supabase.from("tax_groups").insert({ org_id: ctx.org.id, name, cgst_rate: half, sgst_rate: half });

  if (error) {
    if (error.code === "23505") return { error: "Please fix the highlighted fields.", fieldErrors: { name: ["A slab with this name already exists"] } };
    return { error: dbErrorMessage(error) };
  }
  revalidatePath("/settings/taxes");
  return { ok: true, message: id ? "Tax slab updated." : "Tax slab added." };
}

/** Make a slab the default for new menu items. */
export async function setDefaultTaxGroup(id: string): Promise<ActionState> {
  const ctx = await requirePermission("manageTaxes");
  const supabase = await createClient();

  const { data: target } = await supabase.from("tax_groups").select("is_active").eq("id", id).eq("org_id", ctx.org.id).single();
  if (!target) return { error: "Tax slab not found." };
  if (!target.is_active) return { error: "Turn the slab on before making it the default." };

  // Only one default is allowed, so clear the old one first.
  const { error: clearError } = await supabase
    .from("tax_groups")
    .update({ is_default: false })
    .eq("org_id", ctx.org.id)
    .eq("is_default", true);
  if (clearError) return { error: dbErrorMessage(clearError) };

  const { error } = await supabase.from("tax_groups").update({ is_default: true }).eq("id", id);
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/settings/taxes");
  return { ok: true, message: "Default slab changed." };
}

/** Turn a slab on/off. The default slab can't be turned off. */
export async function setTaxGroupActive(id: string, active: boolean): Promise<ActionState> {
  const ctx = await requirePermission("manageTaxes");
  const supabase = await createClient();
  const { data: target } = await supabase.from("tax_groups").select("is_default").eq("id", id).eq("org_id", ctx.org.id).single();
  if (!target) return { error: "Tax slab not found." };
  if (!active && target.is_default) return { error: "Choose another default slab first." };

  const { error } = await supabase.from("tax_groups").update({ is_active: active }).eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/settings/taxes");
  return { ok: true, message: active ? "Slab turned on." : "Slab turned off." };
}

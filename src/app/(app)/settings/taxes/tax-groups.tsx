"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Star } from "lucide-react";
import type { TaxGroup } from "@/types/db";
import type { ActionState } from "@/lib/action";
import { useFormAction } from "@/hooks/use-form-action";
import { saveTaxGroup, setDefaultTaxGroup, setTaxGroupActive } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert, FormMessage } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

function TaxForm({ group, onDone }: { group?: TaxGroup; onDone: (result?: ActionState) => void }) {
  const { state, pending, onSubmit, fieldErrors } = useFormAction(async (prev: ActionState, fd: FormData) => {
    const result = await saveTaxGroup(prev, fd);
    if (result.ok) onDone(result);
    return result;
  });
  const [rate, setRate] = useState(group ? String(group.total_rate) : "");
  const half = Number(rate) / 2;

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-primary/30 bg-primary-light/40 p-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={group?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="Name" htmlFor={`name-${group?.id ?? "new"}`} error={fieldErrors.name}>
          <Input id={`name-${group?.id ?? "new"}`} name="name" defaultValue={group?.name ?? ""} placeholder="GST 5%" autoFocus />
        </Field>
        <Field label="GST %" htmlFor={`rate-${group?.id ?? "new"}`} error={fieldErrors.rate}>
          <Input
            id={`rate-${group?.id ?? "new"}`}
            name="rate"
            type="number"
            step="0.25"
            min={0}
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
      </div>
      {rate !== "" && Number.isFinite(half) && (
        <p className="text-sm text-muted">
          Split on bills as CGST {half}% + SGST {half}%
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending}>{group ? "Save" : "Add slab"}</SubmitButton>
        <Button variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function TaxGroups({ groups }: { groups: TaxGroup[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [notice, setNotice] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();

  const closeForm = (result?: ActionState) => {
    setEditing(null);
    if (result) setNotice(result);
  };

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      setNotice(await fn());
    });

  return (
    <Card>
      <CardHeader
        title="GST slabs"
        description="Each menu item uses one slab. Most restaurants charge 5% GST; restaurants inside hotels with room tariff above ₹7,500 charge 18%."
        action={
          editing !== "new" && (
            <Button onClick={() => { setNotice(null); setEditing("new"); }}>
              <Plus className="h-4 w-4" aria-hidden /> Add slab
            </Button>
          )
        }
      />
      <CardBody className="space-y-3">
        {notice?.error && <Alert tone="danger">{notice.error}</Alert>}
        {notice?.ok && notice.message && <Alert tone="success">{notice.message}</Alert>}
        {editing === "new" && <TaxForm onDone={closeForm} />}

        <ul className="divide-y divide-border rounded-lg border border-border">
          {groups.map((g) =>
            editing === g.id ? (
              <li key={g.id} className="p-3">
                <TaxForm group={g} onDone={closeForm} />
              </li>
            ) : (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-40 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {g.name}
                    {g.is_default && <Badge tone="primary">Default</Badge>}
                    {!g.is_active && <Badge>Off</Badge>}
                  </p>
                  <p className="tabular text-sm text-muted">
                    {g.total_rate}% = CGST {g.cgst_rate}% + SGST {g.sgst_rate}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!g.is_default && g.is_active && (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => setDefaultTaxGroup(g.id))}>
                      <Star className="h-4 w-4" aria-hidden /> Make default
                    </Button>
                  )}
                  {!g.is_default && (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => setTaxGroupActive(g.id, !g.is_active))}>
                      {g.is_active ? "Turn off" : "Turn on"}
                    </Button>
                  )}
                  <Button variant="secondary" disabled={pending} onClick={() => setEditing(g.id)}>
                    <Pencil className="h-4 w-4" aria-hidden /> Edit
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

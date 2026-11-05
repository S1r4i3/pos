"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { Outlet } from "@/types/db";
import type { ActionState } from "@/lib/action";
import { INDIAN_STATES, OUTLET_TYPES } from "@/lib/india";
import { suggestCode } from "@/lib/utils";
import { useFormAction } from "@/hooks/use-form-action";
import { createOutlet, setOutletActive } from "./actions";
import { switchOutlet } from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CheckboxRow, Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert, FormMessage } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Row = Pick<Outlet, "id" | "name" | "code" | "city" | "state" | "gstin" | "outlet_type" | "is_active">;

function NewOutletForm({ onDone }: { onDone: (r?: ActionState) => void }) {
  const { state, pending, onSubmit, fieldErrors } = useFormAction(async (prev: ActionState, fd: FormData) => {
    const result = await createOutlet(prev, fd);
    if (result.ok) onDone(result);
    return result;
  });
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-primary/30 bg-primary-light/40 p-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Outlet name" htmlFor="new-name" error={fieldErrors.name} required>
          <Input id="new-name" name="name" autoFocus onChange={(e) => !touched && setCode(suggestCode(e.target.value))} />
        </Field>
        <Field label="Invoice code" htmlFor="new-code" error={fieldErrors.code} hint="1–4 letters/numbers, unique" required>
          <Input
            id="new-code"
            name="code"
            value={code}
            maxLength={4}
            className="uppercase"
            onChange={(e) => {
              setTouched(true);
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
          />
        </Field>
        <Field label="Type" htmlFor="new-type" error={fieldErrors.outlet_type}>
          <Select id="new-type" name="outlet_type" defaultValue="restaurant">
            {OUTLET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="new-city" error={fieldErrors.city}>
          <Input id="new-city" name="city" />
        </Field>
        <Field label="State" htmlFor="new-state" error={fieldErrors.state_code} required>
          <Select id="new-state" name="state_code" defaultValue="">
            <option value="" disabled>
              Select state
            </option>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <CheckboxRow
        name="copy_settings"
        id="copy_settings"
        label="Copy billing settings and logo from the current outlet"
        description="GST inclusive/exclusive, service charge, business day, receipt footer, paper width."
        defaultChecked
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingText="Adding…">
          Add outlet
        </SubmitButton>
        <Button variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function OutletList({ outlets, currentOutletId }: { outlets: Row[]; currentOutletId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();

  const typeLabel = (t: string) => OUTLET_TYPES.find((o) => o.value === t)?.label ?? t;

  return (
    <Card>
      <CardHeader
        title="Outlets"
        description="Each outlet has its own tables, stock, prices and invoice numbers. The menu is shared."
        action={
          !adding && (
            <Button
              onClick={() => {
                setNotice(null);
                setAdding(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add outlet
            </Button>
          )
        }
      />
      <CardBody className="space-y-3">
        {notice?.error && <Alert tone="danger">{notice.error}</Alert>}
        {notice?.ok && notice.message && <Alert tone="success">{notice.message}</Alert>}
        {adding && (
          <NewOutletForm
            onDone={(r) => {
              setAdding(false);
              if (r) setNotice(r);
            }}
          />
        )}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {outlets.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-48 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {o.name} <Badge>{o.code}</Badge>
                  {o.id === currentOutletId && <Badge tone="primary">Current</Badge>}
                  {!o.is_active && <Badge tone="danger">Off</Badge>}
                </p>
                <p className="text-sm text-muted">
                  {typeLabel(o.outlet_type)}
                  {o.city ? ` · ${o.city}` : ""}
                  {o.state ? `, ${o.state}` : ""}
                  {o.gstin ? ` · GSTIN ${o.gstin}` : " · No GSTIN"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {o.is_active && o.id !== currentOutletId && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await switchOutlet(o.id);
                        router.push("/settings/outlet");
                      })
                    }
                  >
                    Switch & edit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={pending}
                  className={o.is_active ? "text-danger" : ""}
                  onClick={() =>
                    startTransition(async () => {
                      setNotice(await setOutletActive(o.id, !o.is_active));
                      router.refresh();
                    })
                  }
                >
                  {o.is_active ? "Turn off" : "Turn on"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

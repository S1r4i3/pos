"use client";

import { useState } from "react";
import { createRestaurant } from "./actions";
import { useFormAction } from "@/hooks/use-form-action";
import { INDIAN_STATES } from "@/lib/india";
import { suggestCode } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/alert";

export function OnboardingForm({ defaultOwnerName }: { defaultOwnerName: string }) {
  const { state, pending, onSubmit } = useFormAction(createRestaurant);
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const fe = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormMessage state={state} />

      <Card>
        <CardHeader title="Your business" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="orgName" hint="e.g. Spice Route Restaurants" error={fe.orgName} required>
            <Input id="orgName" name="orgName" required autoFocus />
          </Field>
          <Field label="Your name" htmlFor="ownerName" error={fe.ownerName} required>
            <Input id="ownerName" name="ownerName" defaultValue={defaultOwnerName} required />
          </Field>
          <Field label="Mobile number" htmlFor="phone" error={fe.phone}>
            <Input id="phone" name="phone" inputMode="numeric" maxLength={10} placeholder="9876543210" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="First outlet" description="The restaurant, café or kitchen you'll bill from." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Outlet name" htmlFor="outletName" hint="e.g. Banjara Hills" error={fe.outletName} required>
            <Input
              id="outletName"
              name="outletName"
              required
              onChange={(e) => !codeTouched && setCode(suggestCode(e.target.value))}
            />
          </Field>
          <Field
            label="Outlet code"
            htmlFor="outletCode"
            hint="Starts every invoice number: BH1/2627/000001"
            error={fe.outletCode}
            required
          >
            <Input
              id="outletCode"
              name="outletCode"
              value={code}
              maxLength={4}
              className="uppercase"
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              }}
              required
            />
          </Field>
          <Field label="City" htmlFor="city" error={fe.city}>
            <Input id="city" name="city" autoComplete="address-level2" />
          </Field>
          <Field label="State" htmlFor="stateCode" error={fe.stateCode} required>
            <Select id="stateCode" name="stateCode" defaultValue="" required>
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
          <Field label="GSTIN" htmlFor="gstin" hint="Optional — leave empty if not registered" error={fe.gstin}>
            <Input id="gstin" name="gstin" maxLength={15} className="uppercase" placeholder="36AAAAA0000A1Z5" />
          </Field>
          <Field label="FSSAI licence no." htmlFor="fssai" hint="Optional — 14 digits" error={fe.fssai}>
            <Input id="fssai" name="fssai" inputMode="numeric" maxLength={14} />
          </Field>
        </CardBody>
      </Card>

      <p className="text-sm text-muted">
        We&apos;ll also create GST slabs (5%, 18%, No tax) and a &ldquo;Main Hall&rdquo; seating area for you.
      </p>
      <SubmitButton pending={pending} size="lg" className="w-full sm:w-auto" pendingText="Setting up…">
        Create my restaurant
      </SubmitButton>
    </form>
  );
}

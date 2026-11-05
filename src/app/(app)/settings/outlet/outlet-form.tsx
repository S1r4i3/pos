"use client";

import { useState } from "react";
import { updateOutlet } from "./actions";
import { useFormAction } from "@/hooks/use-form-action";
import { INDIAN_STATES, OUTLET_TYPES } from "@/lib/india";
import { hourLabel } from "@/lib/dates";
import type { Outlet } from "@/types/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CheckboxRow, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/alert";

export function OutletForm({ outlet }: { outlet: Outlet }) {
  const { state, pending, onSubmit } = useFormAction(updateOutlet);
  const [scEnabled, setScEnabled] = useState(outlet.service_charge_enabled);
  const fe = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <input type="hidden" name="outletId" value={outlet.id} />

      <Card>
        <CardHeader title="Basic details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Outlet name" htmlFor="name" error={fe.name} required>
            <Input id="name" name="name" defaultValue={outlet.name} required />
          </Field>
          <Field label="Type" htmlFor="outlet_type" error={fe.outlet_type}>
            <Select id="outlet_type" name="outlet_type" defaultValue={outlet.outlet_type}>
              {OUTLET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Invoice code"
            htmlFor="code"
            error={fe.code}
            hint="Starts every invoice number. Avoid changing it in the middle of a financial year."
            required
          >
            <Input id="code" name="code" defaultValue={outlet.code} maxLength={4} className="uppercase" required />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Address & contact" description="Printed on every bill." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" htmlFor="address_line1" error={fe.address_line1} className="sm:col-span-2">
            <Input id="address_line1" name="address_line1" defaultValue={outlet.address_line1 ?? ""} autoComplete="address-line1" />
          </Field>
          <Field label="Address line 2" htmlFor="address_line2" error={fe.address_line2} className="sm:col-span-2">
            <Input id="address_line2" name="address_line2" defaultValue={outlet.address_line2 ?? ""} autoComplete="address-line2" />
          </Field>
          <Field label="City" htmlFor="city" error={fe.city}>
            <Input id="city" name="city" defaultValue={outlet.city ?? ""} autoComplete="address-level2" />
          </Field>
          <Field label="State" htmlFor="state_code" error={fe.state_code}>
            <Select id="state_code" name="state_code" defaultValue={outlet.state_code ?? ""}>
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="PIN code" htmlFor="pincode" error={fe.pincode}>
            <Input id="pincode" name="pincode" defaultValue={outlet.pincode ?? ""} inputMode="numeric" maxLength={6} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={fe.phone}>
            <Input id="phone" name="phone" defaultValue={outlet.phone ?? ""} inputMode="tel" />
          </Field>
          <Field label="Email" htmlFor="email" error={fe.email}>
            <Input id="email" name="email" type="email" defaultValue={outlet.email ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Licences" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN" htmlFor="gstin" error={fe.gstin} hint="15 characters. Must match the state above.">
            <Input id="gstin" name="gstin" defaultValue={outlet.gstin ?? ""} maxLength={15} className="uppercase" />
          </Field>
          <Field label="FSSAI licence no." htmlFor="fssai_no" error={fe.fssai_no} hint="14 digits — must be printed on bills.">
            <Input id="fssai_no" name="fssai_no" defaultValue={outlet.fssai_no ?? ""} inputMode="numeric" maxLength={14} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Billing & tax" />
        <CardBody className="space-y-4">
          <CheckboxRow
            name="prices_include_tax"
            label="Menu prices already include GST"
            description="Tick this if ₹105 on the menu means ₹100 + ₹5 GST. Leave unticked if GST is added on top."
            defaultChecked={outlet.prices_include_tax}
          />
          <CheckboxRow
            name="service_charge_enabled"
            label="Add service charge to dine-in bills"
            description="Guests must be able to ask for it to be removed (CCPA guidelines). The cashier can remove it per bill."
            defaultChecked={outlet.service_charge_enabled}
            onChange={setScEnabled}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service charge %" htmlFor="service_charge_rate" error={fe.service_charge_rate}>
              <Input
                id="service_charge_rate"
                name="service_charge_rate"
                type="number"
                step="0.5"
                min={0}
                max={20}
                inputMode="decimal"
                defaultValue={outlet.service_charge_rate}
                disabled={!scEnabled}
              />
            </Field>
            <Field
              label="Business day starts at"
              htmlFor="day_start_hour"
              error={fe.day_start_hour}
              hint="Bills before this time count for the previous day (useful if you close after midnight)."
            >
              <Select id="day_start_hour" name="day_start_hour" defaultValue={String(outlet.day_start_hour)}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Receipt" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Header text" htmlFor="receipt_header" error={fe.receipt_header} hint="e.g. Pure veg · Home delivery 9876543210">
            <Textarea id="receipt_header" name="receipt_header" defaultValue={outlet.receipt_header ?? ""} rows={2} />
          </Field>
          <Field label="Footer text" htmlFor="receipt_footer" error={fe.receipt_footer}>
            <Textarea id="receipt_footer" name="receipt_footer" defaultValue={outlet.receipt_footer ?? ""} rows={2} />
          </Field>
          <Field label="Printer paper width" htmlFor="printer_paper_width" error={fe.printer_paper_width}>
            <Select id="printer_paper_width" name="printer_paper_width" defaultValue={String(outlet.printer_paper_width)}>
              <option value="80">80 mm (3 inch)</option>
              <option value="58">58 mm (2 inch)</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <FormMessage state={state} />
        <SubmitButton pending={pending} size="lg" className="w-full sm:w-auto">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}

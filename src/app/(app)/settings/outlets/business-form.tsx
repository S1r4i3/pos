"use client";

import type { Organization } from "@/types/db";
import { useFormAction } from "@/hooks/use-form-action";
import { updateBusiness } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/alert";

export function BusinessForm({ org }: { org: Organization }) {
  const { state, pending, onSubmit, fieldErrors } = useFormAction(updateBusiness);

  return (
    <Card>
      <CardHeader title="Business" description="Applies to all your outlets." />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Business name" htmlFor="biz-name" error={fieldErrors.name} required>
              <Input id="biz-name" name="name" defaultValue={org.name} />
            </Field>
            <Field label="Phone" htmlFor="biz-phone" error={fieldErrors.phone}>
              <Input id="biz-phone" name="phone" defaultValue={org.phone ?? ""} inputMode="tel" />
            </Field>
            <Field label="Email" htmlFor="biz-email" error={fieldErrors.email}>
              <Input id="biz-email" name="email" type="email" defaultValue={org.email ?? ""} />
            </Field>
          </div>
          <SubmitButton pending={pending}>Save business</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}

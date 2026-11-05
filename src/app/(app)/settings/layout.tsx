import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermission("manageOutlet");

  const tabs = [
    { href: "/settings/outlet", label: "Outlet details" },
    ...(can(ctx.role, "manageTaxes") ? [{ href: "/settings/taxes", label: "GST & taxes" }] : []),
    ...(can(ctx.role, "manageOutlets") ? [{ href: "/settings/outlets", label: "Business & outlets" }] : []),
  ];

  return (
    <>
      <PageHeader title="Settings" description={`Changes apply to ${ctx.outlet.name} unless noted.`} />
      <SettingsTabs tabs={tabs} />
      <div className="mt-6">{children}</div>
    </>
  );
}

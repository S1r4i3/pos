import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, ReceiptIndianRupee, ShoppingBag, Timer, TrendingUp } from "lucide-react";
import { requireContext } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { businessDate, formatDateIN } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; welcome?: string }>;
}) {
  const ctx = await requireContext();
  const { denied, welcome } = await searchParams;
  const supabase = await createClient();
  const today = businessDate(ctx.outlet.day_start_hour);
  const showSales = can(ctx.role, "viewSales");
  const showSetup = can(ctx.role, "manageOutlet");

  // Today's numbers (real queries — they show ₹0 until billing arrives in Phase 3)
  let sales = { total: 0, count: 0, open: 0 };
  if (showSales) {
    const [{ data: settled }, { count: openCount }] = await Promise.all([
      supabase
        .from("orders")
        .select("grand_total")
        .eq("outlet_id", ctx.outlet.id)
        .eq("business_date", today)
        .eq("status", "settled"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("outlet_id", ctx.outlet.id)
        .in("status", ["open", "billed"]),
    ]);
    const rows = settled ?? [];
    sales = {
      total: rows.reduce((sum, r) => sum + Number(r.grand_total), 0),
      count: rows.length,
      open: openCount ?? 0,
    };
  }

  // Setup checklist
  let checklist: { label: string; done: boolean; href?: string; note?: string }[] = [];
  if (showSetup) {
    const [{ data: outlet }, { count: itemCount }, { count: tableCount }] = await Promise.all([
      supabase
        .from("outlets")
        .select("address_line1, phone, gstin, fssai_no, logo_url")
        .eq("id", ctx.outlet.id)
        .single(),
      supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
      supabase.from("dining_tables").select("id", { count: "exact", head: true }).eq("outlet_id", ctx.outlet.id),
    ]);
    checklist = [
      { label: "Add outlet address & phone", done: Boolean(outlet?.address_line1 && outlet?.phone), href: "/settings/outlet" },
      { label: "Add GSTIN (if GST registered)", done: Boolean(outlet?.gstin), href: "/settings/outlet" },
      { label: "Add FSSAI licence number", done: Boolean(outlet?.fssai_no), href: "/settings/outlet" },
      { label: "Upload your logo", done: Boolean(outlet?.logo_url), href: "/settings/outlet" },
      { label: "Add your menu", done: (itemCount ?? 0) > 0, note: "Phase 2" },
      { label: "Set up tables", done: (tableCount ?? 0) > 0, note: "Phase 3" },
    ];
  }
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${ctx.staff.fullName.split(" ")[0]}`}
        description={
          <>
            {ctx.outlet.name} · Business day {formatDateIN(today)} ·{" "}
            <Badge tone="primary">{ROLE_LABELS[ctx.role]}</Badge>
          </>
        }
      />

      <div className="space-y-6">
        {denied && <Alert tone="warning">Your role doesn&apos;t have access to that page.</Alert>}
        {welcome && (
          <Alert tone="success">
            Your restaurant is ready! Finish the checklist below, then we&apos;ll add your menu in Phase 2.
          </Alert>
        )}

        {showSales && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Today's sales" value={formatINR(sales.total)} />
            <StatCard icon={<ReceiptIndianRupee className="h-5 w-5" />} label="Bills settled" value={String(sales.count)} />
            <StatCard
              icon={<ShoppingBag className="h-5 w-5" />}
              label="Average bill"
              value={formatINR(sales.count ? sales.total / sales.count : 0)}
            />
            <StatCard icon={<Timer className="h-5 w-5" />} label="Open orders" value={String(sales.open)} />
          </div>
        )}

        {showSetup && (
          <Card>
            <CardHeader
              title="Getting started"
              description={`${doneCount} of ${checklist.length} done`}
              action={
                <div className="h-2 w-32 overflow-hidden rounded-full bg-background" aria-hidden>
                  <div className="h-full bg-success" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
                </div>
              }
            />
            <ul className="divide-y divide-border">
              {checklist.map((item) => {
                const content = (
                  <>
                    {item.done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-muted" aria-label="Not done" />
                    )}
                    <span className={item.done ? "text-muted line-through" : ""}>{item.label}</span>
                    {item.note && !item.done && <Badge className="ml-auto">{item.note}</Badge>}
                  </>
                );
                return (
                  <li key={item.label}>
                    {item.href && !item.done ? (
                      <Link href={item.href} className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm hover:bg-background">
                        {content}
                        <span className="ml-auto text-sm font-medium text-primary">Set up →</span>
                      </Link>
                    ) : (
                      <div className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {!showSales && !showSetup && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">
                Welcome! Your screens ({ctx.role === "kitchen" ? "Kitchen Display" : "Billing and Tables"}) will appear
                in the menu as they are released.
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between text-muted">
        <span className="text-sm">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary">{icon}</span>
      </div>
      <p className="tabular mt-3 text-xl font-semibold sm:text-2xl">{value}</p>
    </Card>
  );
}

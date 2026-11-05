import { requireContext } from "@/lib/auth/session";
import { navFor, ROLE_LABELS } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();

  return (
    <AppShell
      nav={navFor(ctx.role)}
      orgName={ctx.org.name}
      userName={ctx.staff.fullName}
      roleLabel={ROLE_LABELS[ctx.role]}
      outlets={ctx.outlets.map(({ id, name, code }) => ({ id, name, code }))}
      currentOutletId={ctx.outlet.id}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}

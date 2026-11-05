"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, Menu, UtensilsCrossed, X } from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";
import { OutletSwitcher } from "./outlet-switcher";

export type ShellNavItem = { href: string; label: string; icon: NavIconName; ready: boolean; phase: number };

type Props = {
  nav: ShellNavItem[];
  orgName: string;
  userName: string;
  roleLabel: string;
  outlets: { id: string; name: string; code: string }[];
  currentOutletId: string;
  signOutAction: () => Promise<void>;
  children: ReactNode;
};

function SidebarContent({ nav, orgName, userName, roleLabel, outlets, currentOutletId, signOutAction, onNavigate }: Omit<Props, "children"> & { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
          <UtensilsCrossed className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{orgName}</p>
          <p className="text-xs text-slate-400">RestoPOS</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <OutletSwitcher outlets={outlets} currentId={currentOutletId} dark />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          if (!item.ready) {
            return (
              <span
                key={item.href}
                className="flex h-11 cursor-not-allowed items-center gap-3 rounded-lg px-3 text-sm text-slate-500"
                title={`Arrives in Phase ${item.phase}`}
              >
                <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">Soon</span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-primary text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="px-3 pb-2">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          <p className="text-xs text-slate-400">{roleLabel}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-5 w-5" aria-hidden />
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop / tablet-landscape sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar lg:block">
        <SidebarContent {...props} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-background"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" aria-hidden />
        </button>
        <span className="truncate font-semibold">{props.orgName}</span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-sidebar">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <SidebarContent {...props} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{props.children}</main>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { switchOutlet } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

type OutletOption = { id: string; name: string; code: string };

export function OutletSwitcher({
  outlets,
  currentId,
  dark,
}: {
  outlets: OutletOption[];
  currentId: string;
  dark?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (outlets.length <= 1) {
    const only = outlets[0];
    return (
      <div className={cn("flex h-11 items-center gap-2 px-3 text-sm", dark ? "text-slate-200" : "text-text")}>
        <Store className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate font-medium">{only?.name}</span>
      </div>
    );
  }

  return (
    <label className="relative block">
      <span className="sr-only">Current outlet</span>
      <Store
        className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", dark ? "text-slate-300" : "text-muted")}
        aria-hidden
      />
      <select
        value={currentId}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await switchOutlet(e.target.value);
            router.refresh();
          })
        }
        className={cn(
          "h-11 w-full appearance-none truncate rounded-lg pl-9 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary",
          dark ? "border border-white/10 bg-white/5 text-white" : "border border-border bg-card text-text",
          pending && "opacity-60",
        )}
      >
        {outlets.map((o) => (
          <option key={o.id} value={o.id} className="text-text">
            {o.name} ({o.code})
          </option>
        ))}
      </select>
      <span
        className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs", dark ? "text-slate-300" : "text-muted")}
        aria-hidden
      >
        ▾
      </span>
    </label>
  );
}

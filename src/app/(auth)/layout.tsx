import { UtensilsCrossed } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
          <UtensilsCrossed className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-xl font-bold tracking-tight">RestoPOS</span>
      </div>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 sm:p-8">{children}</div>
    </main>
  );
}

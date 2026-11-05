// Indian Rupee formatting: 123456.5 → "₹1,23,456.50"

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(value: number | string | null | undefined, opts?: { whole?: boolean }) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return inr.format(0);
  return opts?.whole ? inrWhole.format(n) : inr.format(n);
}

/** 1234567 → "12,34,567" (no symbol) */
export function formatIndianNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

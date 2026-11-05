// Date helpers for India (IST, UTC+05:30, no daylight saving).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The restaurant's "business day" as YYYY-MM-DD.
 * Sales before `dayStartHour` (e.g. 1 AM with a 4 AM day start) count for
 * the previous day — same rule the database uses.
 */
export function businessDate(dayStartHour: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS - dayStartHour * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function formatDateIN(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

export function hourLabel(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}

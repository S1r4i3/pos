// Reads the public Supabase settings once and fails loudly if they're missing,
// so a typo in .env.local shows a clear message instead of a confusing error.
//
// NOTE: NEXT_PUBLIC_* values must be read with the full literal name
// (process.env.NEXT_PUBLIC_X) so Next.js can embed them in the browser bundle.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Supabase is not configured. Copy .env.example to .env.local and fill in " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart `npm run dev`.",
  );
}

export const SUPABASE_URL: string = url;
export const SUPABASE_KEY: string = key;
export const SITE_URL: string = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Name of the cookie that remembers which outlet the user is working in. */
export const OUTLET_COOKIE = "pos_outlet";

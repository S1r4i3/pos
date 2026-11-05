import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

/**
 * ADMIN client using the secret key. It BYPASSES all security rules.
 *
 * Only for trusted server code that must do things a normal user can't
 * (e.g. creating a login for a new staff member in Phase 7).
 * The "server-only" import above makes the build fail if this file is ever
 * imported into browser code, so the secret can't leak.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is missing in .env.local");
  }
  return createClient(SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

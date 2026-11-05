import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/** Pages anyone can open without logging in. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth/callback"];
/** Pages a logged-in user doesn't need (we send them to the dashboard). */
const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Runs before every page:
 * 1. Refreshes the Supabase login cookie if it is about to expire.
 * 2. Sends signed-out visitors to /login (remembering where they were going).
 * 3. Sends signed-in users away from the login/sign-up pages.
 *
 * This is only a fast first check — every page and action still verifies the
 * user and role again on the server (see src/lib/auth/session.ts).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // IMPORTANT: nothing may run between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (path === "/login" && pathname !== "/") {
      url.searchParams.set("next", pathname + search);
    }
    const redirect = NextResponse.redirect(url);
    // keep any refreshed login cookies
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!isLoggedIn && !matches(pathname, PUBLIC_PATHS)) {
    return redirectTo("/login");
  }
  if (isLoggedIn && matches(pathname, GUEST_ONLY_PATHS)) {
    return redirectTo("/dashboard");
  }
  return response;
}

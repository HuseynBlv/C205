import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Refreshes the Supabase auth cookie on every request. Server Components
 * can't write cookies, so without this, a session nearing its access-token
 * expiry would never get refreshed until something that CAN write cookies
 * (a Server Action, a Route Handler) happens to run.
 *
 * This is an OPTIMISTIC check only (per Next.js's own guidance on Proxy —
 * it must stay fast and cheap since it runs on every request, including
 * prefetches). It never makes authorization decisions by itself; it only
 * redirects unauthenticated visitors away from routes that always require a
 * session, as a cheap first line of defense. The real authorization check —
 * live account_status/role/email-verification, re-checked on every request
 * — happens in the DAL (src/lib/auth/dal.ts) and in the database via RLS
 * and the SECURITY DEFINER functions, which is what actually matters: a
 * Server Function reachable outside this matcher, or a request Proxy never
 * saw, must still be safe on its own.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Supabase isn't configured (e.g. local fixtures-only preview). Nothing
    // to refresh; let the request through as-is.
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not add logic between createServerClient and this call — it's what
  // actually triggers the refresh, and anything in between would run
  // against a possibly-stale session.
  const { data } = await supabase.auth.getClaims();

  const pathname = request.nextUrl.pathname;
  // /admin-setup intentionally matches the "/admin" prefix here too — it
  // requires being signed in just as much as the rest of the admin surface.
  const requiresSession =
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/admin");
  // Every route that can read or write cookie-carried session state, even
  // ones a signed-out visitor may land on (login, password reset) — none of
  // these should ever be reusable from a shared cache for a different
  // visitor.
  const isSessionSensitive =
    requiresSession ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth/");

  if (requiresSession && !data?.claims) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isSessionSensitive) {
    supabaseResponse.headers.set("Cache-Control", "private, no-store");
  }

  return supabaseResponse;
}

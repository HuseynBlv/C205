import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Uses only the anon key — every privileged operation goes
 * through a SECURITY DEFINER Postgres function (see supabase/migrations),
 * not the service-role key, so that key never needs to exist in this
 * process at all.
 *
 * `setAll` can throw when called from a Server Component (which can't set
 * cookies) — that's fine here as long as proxy.ts is also refreshing the
 * session on every request, per the official @supabase/ssr guidance.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component during rendering — ignored
            // because proxy.ts refreshes the session on every request.
          }
        },
      },
    },
  );
}

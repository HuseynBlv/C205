import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Renamed from `middleware.ts` in Next.js 16 — see AGENTS.md. Function name,
// file location (next to `app/`), and behavior are otherwise unchanged from
// the "middleware" convention most docs still describe.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

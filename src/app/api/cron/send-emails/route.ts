import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { drainEmailOutbox } from "@/lib/email/worker";

/**
 * Drains public.email_outbox on a schedule — the reliable, catches-
 * everything path (pg_cron primary, GitHub Actions secondary, Vercel
 * daily fallback). Most emails never actually wait for this: every
 * server action that enqueues a row also fires drainEmailOutbox()
 * immediately via next/server's after() (see src/lib/booking/actions.ts
 * and src/app/auth/confirm/route.ts). This route exists for whatever
 * that immediate attempt missed — a transient Resend failure, a request
 * that got interrupted before after() ran, or a deployment where the
 * immediate path itself is somehow unavailable.
 *
 * Meant to be hit on a schedule rather than by a browser — there is no
 * signed-in user for a cron trigger, so this is gated by `CRON_SECRET`,
 * checked here with `timingSafeEqual` (the same pattern
 * `admin-setup/actions.ts` already uses for ADMIN_BOOTSTRAP_SECRET).
 * Named to match Vercel Cron's own convention — when a Vercel Cron Job
 * (see vercel.json) calls a route, Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` for you, so deploying there needs
 * no extra scheduler configuration. Any other host needs its own
 * external scheduler sending that same header. The actual database-level
 * authorization (EMAIL_WORKER_SECRET) lives inside drainEmailOutbox —
 * see that module's own comment for why it's a second, distinct secret.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !process.env.EMAIL_WORKER_SECRET) {
    // Fail closed: either secret unset disables this route entirely, the
    // same rule /admin-setup already applies to ADMIN_BOOTSTRAP_SECRET.
    return NextResponse.json({ error: "Email worker is not configured on this deployment." }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secretsMatch(provided, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // EMAIL_WORKER_SECRET presence was just confirmed above, so a null
  // return here only ever means the claim RPC itself errored.
  const result = await drainEmailOutbox(20);
  if (result === null) {
    return NextResponse.json({ error: "Failed to claim pending emails." }, { status: 500 });
  }

  return NextResponse.json(result);
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import type { Tables } from "@/lib/supabase/database.types";

type OutboxRow = Tables<"email_outbox">;

/**
 * Drains public.email_outbox — the actual "send the notification" half of
 * the notifications feature, which until now only ever enqueued rows
 * (every SECURITY DEFINER function in supabase/migrations/*.sql writes
 * them; nothing read them back out). Meant to be hit on a schedule rather
 * than by a browser — there is no signed-in user for a cron trigger, so
 * two separate secrets gate this, deliberately not the same value:
 *
 * - `CRON_SECRET` authorizes the HTTP request itself, checked here with
 *   `timingSafeEqual` (the same pattern `admin-setup/actions.ts` already
 *   uses for ADMIN_BOOTSTRAP_SECRET). Named to match Vercel Cron's own
 *   convention — when a Vercel Cron Job (see vercel.json) calls a route,
 *   Vercel automatically sends `Authorization: Bearer $CRON_SECRET` for
 *   you, so deploying there needs no extra scheduler configuration. Any
 *   other host needs its own external scheduler sending that same header.
 * - `EMAIL_WORKER_SECRET` authorizes the three RPC calls below at the
 *   database level (see that migration's own comment for why: those
 *   functions are also reachable with just the public anon key, so they
 *   can't rely on this route being the only caller). Kept distinct from
 *   `CRON_SECRET` so leaking or rotating one never affects the other.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const workerSecret = process.env.EMAIL_WORKER_SECRET;
  if (!cronSecret || !workerSecret) {
    // Fail closed: either secret unset disables this route entirely, the
    // same rule /admin-setup already applies to ADMIN_BOOTSTRAP_SECRET.
    return NextResponse.json({ error: "Email worker is not configured on this deployment." }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secretsMatch(provided, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_pending_emails", {
    p_secret: workerSecret,
    p_limit: 20,
  });

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const rows = (claimed ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await sendEmail({ to: row.to_email, subject: row.subject, text: row.body });
    if (result.ok) {
      await supabase.rpc("mark_email_sent", { p_secret: workerSecret, p_id: row.id });
      sent += 1;
    } else {
      await supabase.rpc("mark_email_failed", { p_secret: workerSecret, p_id: row.id, p_error: result.error });
      failed += 1;
    }
  }

  return NextResponse.json({ claimed: rows.length, sent, failed });
}

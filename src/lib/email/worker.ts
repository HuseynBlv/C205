import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { renderReservationEmail } from "@/lib/email/templates";
import type { Database, Tables } from "@/lib/supabase/database.types";

type OutboxRow = Tables<"email_outbox">;
type Reservation = Tables<"reservations">;

/**
 * Deliberately NOT the cookie-bound SSR client (@/lib/supabase/server) —
 * claim_pending_emails / mark_email_sent / mark_email_failed /
 * get_reservation_for_notification are granted to `anon` only and
 * revoked from `authenticated` on purpose (see
 * 20260908150000_email_worker.sql): identity here comes from
 * EMAIL_WORKER_SECRET, never from whichever user happens to be signed in
 * when this runs. Calling this from inside a logged-in admin's server
 * action with the SSR client would authenticate as `authenticated` and
 * get a permissions error — a plain, session-less client always resolves
 * to `anon`, matching exactly what the real cron HTTP request (no
 * Supabase cookies at all) already produces.
 */
function anonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Claims and sends up to `limit` pending outbox rows. Used two ways: by
 * the scheduled /api/cron/send-emails route (the reliable, catches-
 * everything path — pg_cron primary, GitHub Actions secondary, Vercel
 * daily fallback), and fired via next/server's after() immediately after
 * any server action that just enqueued a row, so a requester or admin
 * isn't stuck waiting out the cron interval for mail that's already
 * sitting in the outbox. Both paths claim from the same table with
 * `FOR UPDATE SKIP LOCKED` (see claim_pending_emails), so firing this
 * immediately never risks a double send against the next scheduled run
 * landing moments later — whichever claims a row first wins, the other
 * skips it.
 *
 * Returns null (never throws) when EMAIL_WORKER_SECRET isn't configured,
 * or if the claim itself errors — the caller here is either the cron
 * route (which turns null into its own 503) or fire-and-forget code
 * after a user-facing action, where a delivery hiccup must never surface
 * as an error on the action that triggered it; the scheduled route
 * remains the reliable fallback regardless.
 */
export async function drainEmailOutbox(
  limit = 20,
): Promise<{ claimed: number; sent: number; failed: number } | null> {
  const workerSecret = process.env.EMAIL_WORKER_SECRET;
  if (!workerSecret) return null;

  const supabase = anonClient();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_pending_emails", {
    p_secret: workerSecret,
    p_limit: limit,
  });
  if (claimError) return null;

  const rows = (claimed ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    let reservation: Reservation | null = null;
    if (row.related_reservation_id) {
      const { data } = await supabase.rpc("get_reservation_for_notification", {
        p_secret: workerSecret,
        p_id: row.related_reservation_id,
      });
      reservation = (data as Reservation | null) ?? null;
    }

    const { html, text } = renderReservationEmail(row.template, reservation, {
      subject: row.subject,
      text: row.body,
    });

    const result = await sendEmail({ to: row.to_email, subject: row.subject, html, text });
    if (result.ok) {
      await supabase.rpc("mark_email_sent", { p_secret: workerSecret, p_id: row.id });
      sent += 1;
    } else {
      await supabase.rpc("mark_email_failed", { p_secret: workerSecret, p_id: row.id, p_error: result.error });
      failed += 1;
    }
  }

  return { claimed: rows.length, sent, failed };
}

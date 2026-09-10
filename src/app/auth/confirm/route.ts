import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { drainEmailOutbox } from "@/lib/email/worker";

/**
 * Handles every email-link flow (signup confirmation, password recovery):
 * Supabase's email templates point `{{ .ConfirmationURL }}` at this route
 * with `token_hash` + `type` query params, per the current documented
 * pattern (verifyOtp, not the OAuth-style exchangeCodeForSession, which is
 * for a different flow). A GET request triggering a state change here is
 * fine — the token_hash itself is the unforgeable secret an attacker can't
 * guess or supply, unlike an ambient cookie, so this isn't the kind of
 * mutation CSRF protection is for.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // A confirmed signup queues an admin-notification email via the
      // handle_auth_user_email_confirmed trigger — send it now rather
      // than making USG wait out the cron interval to learn a new
      // account needs authorizing. A password-recovery verifyOtp queues
      // nothing, so this is a harmless no-op claim attempt in that case.
      after(() => drainEmailOutbox());
      const response = NextResponse.redirect(new URL(next, origin));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  const response = NextResponse.redirect(new URL("/auth/error", origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/dal";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Derives this deployment's own origin from the incoming request rather
 * than a hardcoded value, so email links work the same in local dev and
 * once hosted. Trusts X-Forwarded-* only insofar as the platform in front
 * of Next.js is trusted to set them correctly (true for Vercel and for the
 * local Supabase/Next dev setup here) — this value is only ever used to
 * build a redirect target inside Supabase's own allow-listed
 * `additional_redirect_urls`, never for anything security-sensitive on its
 * own.
 *
 * Note this is the final destination (e.g. `/calendar`), not the
 * `/auth/confirm` route itself — the actual `token_hash`-carrying link is
 * built by the email template (supabase/templates/*.html), which appends
 * this value as `next`. See that directory's comment in config.toml for why
 * the template, not this option, has to own the link shape.
 */
async function getOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signUpAction(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      // Ignored server-side by the handle_new_auth_user trigger for
      // role/account_status — only full_name is ever read from this.
      data: { full_name: input.fullName },
      emailRedirectTo: `${origin}/calendar`,
    },
  });

  if (error) {
    // Logged server-side only — this previously discarded the real error
    // entirely, turning every failure (a real outage, a misconfigured SMTP
    // relay, a rate limit) into the same unhelpful generic message with no
    // way to diagnose it afterward. Safe to log the raw error here since
    // this never reaches the client.
    console.error("signUpAction: supabase.auth.signUp failed", error);

    // `over_email_send_rate_limit` (and the generic request-rate variant)
    // are safe to reveal distinctly, unlike almost every other Auth error
    // code: hitting a send-rate limit doesn't depend on whether this email
    // already has an account, so surfacing it can't be used to enumerate
    // emails the way e.g. "email_exists" would. Every other code — a real
    // outage, a misconfigured SMTP relay, anything else — still falls
    // through to the same generic message on purpose.
    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
      return {
        ok: false,
        error: "Too many attempts for this email address recently. Please wait a few minutes and try again.",
      };
    }

    return { ok: false, error: "We couldn't create your account. Please try again." };
  }

  // Supabase intentionally returns no error and an empty `identities` array
  // when the email is already registered — specifically so this response
  // can't be used to enumerate accounts. Always show the same generic
  // confirmation regardless, never a distinguishing message.
  return { ok: true };
}

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(input);

  if (error) {
    // Supabase's own message here ("Invalid login credentials") already
    // doesn't distinguish "no such account" from "wrong password" — kept
    // as-is rather than replaced, to avoid accidentally making it more
    // specific than that.
    return { ok: false, error: error.message };
  }

  redirect("/calendar");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(input: { email: string }): Promise<ActionResult> {
  const supabase = await createClient();
  const origin = await getOrigin();

  await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${origin}/reset-password`,
  });

  // Like signUp, this never reveals whether the address has an account —
  // Supabase's own resetPasswordForEmail returns success either way, and we
  // preserve that here rather than surfacing an error for "not found".
  return { ok: true };
}

export async function updatePasswordAction(input: { password: string }): Promise<ActionResult> {
  const user = await getVerifiedUser();
  if (!user) {
    return { ok: false, error: "Your reset link has expired. Request a new one." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) {
    return { ok: false, error: "Couldn't update your password. Try a longer password." };
  }

  redirect("/login?reset=success");
}

export async function resendVerificationEmailAction(): Promise<ActionResult> {
  const user = await getVerifiedUser();
  if (!user?.email) {
    return { ok: false, error: "You need to be signed in to resend a verification email." };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: user.email,
    options: { emailRedirectTo: `${origin}/calendar` },
  });

  if (error) {
    return { ok: false, error: "Couldn't resend the email. Try again shortly." };
  }
  return { ok: true };
}

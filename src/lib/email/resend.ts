import "server-only";

/**
 * A minimal fetch wrapper for Resend's send API — no SDK dependency, since
 * this is the one HTTP call the whole notifications feature needs. Sends
 * both an HTML part (src/lib/email/templates.ts) and a plain-text part
 * (the outbox row's own pre-composed `body`, used verbatim as a fallback
 * for clients that don't render HTML) — never HTML-only.
 */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !from) {
    return { ok: false, error: "EMAIL_PROVIDER_API_KEY / EMAIL_FROM_ADDRESS not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    // Resend returns a JSON body describing the failure; fall back to the
    // raw text if that parse fails for any reason (never throw here — a
    // send failure is an expected, retryable outcome for the caller, not
    // an exceptional one).
    const detail = await res.json().then((body) => body?.message, () => null);
    return { ok: false, error: `Resend ${res.status}: ${detail ?? res.statusText}` };
  }

  return { ok: true };
}

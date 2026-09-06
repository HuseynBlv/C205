"use client";

import { useState } from "react";
import { LogOut, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendVerificationEmailAction } from "@/lib/auth/actions";

export function EmailVerificationRequiredState({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut?: () => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resend() {
    setState("sending");
    const result = await resendVerificationEmailAction();
    setState(result.ok ? "sent" : "error");
  }

  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent">
          <Mail className="size-7 text-accent-foreground" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-foreground">Verify your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
          Click it to continue — an administrator still needs to authorize
          reservation access afterward, so verifying is the first of two
          steps, not the last.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" size="sm" onClick={resend} disabled={state === "sending"}>
            {state === "sent" ? <MailCheck className="size-4" /> : <Mail className="size-4" />}
            {state === "sending"
              ? "Sending…"
              : state === "sent"
                ? "Email sent"
                : "Resend email"}
          </Button>
          {onSignOut ? (
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          ) : null}
        </div>
        {state === "error" ? (
          <p className="mt-3 text-xs text-destructive">
            Couldn&apos;t resend the email. Try again in a moment.
          </p>
        ) : null}
      </div>
    </div>
  );
}

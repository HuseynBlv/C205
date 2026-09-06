import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MinimalShell } from "@/components/layout/minimal-shell";

export default function AuthErrorPage() {
  return (
    <MinimalShell>
      <div className="flex min-h-[70vh] flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#f8ebe9]">
            <AlertTriangle className="size-7 text-[#8a3c37]" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-foreground">This link no longer works</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Confirmation and password-reset links expire after a short time
            and can only be used once. Request a new one to continue.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" size="sm" asChild>
              <Link href="/forgot-password">Reset password</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </MinimalShell>
  );
}

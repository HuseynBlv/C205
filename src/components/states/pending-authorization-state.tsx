import { Clock, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ORG_NAME } from "@/lib/config";

export function PendingAuthorizationState({ onSignOut }: { onSignOut?: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50">
          <Clock className="size-7 text-amber-600" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-foreground">
          Your account is awaiting authorization
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your email is verified, but an administrator still needs to authorize
          reservation access before you can request {ORG_NAME}&apos;s room, C205.
          You&apos;ll receive an email as soon as a decision is made.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" size="sm" asChild>
            <a href="mailto:usg@university.edu">
              <Mail className="size-4" />
              Contact USG
            </a>
          </Button>
          {onSignOut ? (
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

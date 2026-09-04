import { DatabaseZap } from "lucide-react";

/**
 * Shown instead of the authenticated shell whenever Supabase Auth isn't
 * configured yet and dev fixtures are off (i.e. production today, or local
 * development with NEXT_PUBLIC_USE_FIXTURES=false). Authentication, the
 * database, and the booking engine are implemented in a follow-up step —
 * this state avoids ever faking a signed-in experience.
 */
export function BackendNotConfiguredState() {
  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent">
          <DatabaseZap className="size-7 text-accent-foreground" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-foreground">
          Sign-in isn&apos;t connected yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This build has the application shell but no database or
          authentication configured. Set the Supabase environment variables
          and complete the auth step to enable real accounts and requests.
        </p>
      </div>
    </div>
  );
}

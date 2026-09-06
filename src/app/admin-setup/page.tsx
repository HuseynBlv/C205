import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { MinimalShell } from "@/components/layout/minimal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getVerifiedUser, getCurrentProfile } from "@/lib/auth/dal";
import { AdminSetupForm } from "@/app/admin-setup/setup-form";

// Deliberately not linked from anywhere in the app's navigation. Reachable
// only by whoever knows this URL AND the ADMIN_BOOTSTRAP_SECRET — and even
// then, supabase.rpc('bootstrap_first_admin') refuses to run a second time
// once any administrator exists (see supabase/migrations/…_auth_hardening).
export default async function AdminSetupPage() {
  const user = await getVerifiedUser();

  return (
    <MinimalShell>
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-full bg-accent">
                <ShieldCheck className="size-5 text-accent-foreground" aria-hidden="true" />
              </div>
              <CardTitle className="mt-3">First-administrator setup</CardTitle>
              <CardDescription>
                One-time only. This becomes unreachable the moment an
                administrator exists.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!user ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Sign in with the account you want to become administrator, then return here.</p>
                  <Button size="sm" asChild>
                    <Link href="/login?next=/admin-setup">Sign in</Link>
                  </Button>
                </div>
              ) : (
                <AdminSetupGate />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MinimalShell>
  );
}

async function AdminSetupGate() {
  const profile = await getCurrentProfile();
  if (!profile?.email_verified_at) {
    return (
      <p className="text-sm text-muted-foreground">
        Verify your email first — check your inbox for the confirmation link,
        then come back to this page.
      </p>
    );
  }

  return <AdminSetupForm />;
}

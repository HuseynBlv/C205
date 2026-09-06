import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsgEmailForm } from "@/components/admin/usg-email-form";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { useFixtures } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage() {
  const profile = useFixtures ? null : await getCurrentProfile();
  const admin = useFixtures ? undefined : isActiveAdmin(profile);

  let currentEmail = "usg@university.edu";
  if (!useFixtures && admin) {
    const supabase = await createClient();
    const { data } = await supabase.from("app_settings").select("usg_notification_email").eq("id", true).single();
    currentEmail = data?.usg_notification_email ?? currentEmail;
  }

  return (
    <RequireAdmin isAdmin={admin}>
      <PageHeader title="Settings" description="Configure the USG notification email." />
      {useFixtures ? (
        <PreviewNotice>
          Fixture preview — set NEXT_PUBLIC_USE_FIXTURES=false to save the
          real setting.
        </PreviewNotice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification email</CardTitle>
          <CardDescription>
            Where USG receives an email every time a request is submitted.
            Sending isn&apos;t wired up yet — this just controls where
            future notifications will go.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {useFixtures ? (
            <p className="text-sm text-muted-foreground">{currentEmail} (placeholder)</p>
          ) : (
            <UsgEmailForm currentEmail={currentEmail} />
          )}
        </CardContent>
      </Card>
    </RequireAdmin>
  );
}

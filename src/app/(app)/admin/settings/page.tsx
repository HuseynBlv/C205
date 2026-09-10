import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationRecipientsForm } from "@/components/admin/notification-recipients-form";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { useFixtures } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage() {
  const profile = useFixtures ? null : await getCurrentProfile();
  const admin = useFixtures ? undefined : isActiveAdmin(profile);

  let recipients = ["usg@university.edu"];
  if (!useFixtures && admin) {
    const supabase = await createClient();
    const { data } = await supabase.from("usg_notification_recipients").select("email").order("email");
    if (data && data.length > 0) recipients = data.map((r) => r.email);
  }

  return (
    <RequireAdmin isAdmin={admin}>
      <PageHeader title="Settings" description="Configure who USG's notification emails go to." />
      {useFixtures ? (
        <PreviewNotice>
          Fixture preview — set NEXT_PUBLIC_USE_FIXTURES=false to save the
          real setting.
        </PreviewNotice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification emails</CardTitle>
          <CardDescription>
            Every address below receives an email whenever a request is submitted or a new account
            needs authorizing. Requesters are separately emailed automatically when their own
            request is approved, rejected, cancelled, or modified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {useFixtures ? (
            <p className="text-sm text-muted-foreground">{recipients.join(", ")} (placeholder)</p>
          ) : (
            <NotificationRecipientsForm recipients={recipients} />
          )}
        </CardContent>
      </Card>
    </RequireAdmin>
  );
}

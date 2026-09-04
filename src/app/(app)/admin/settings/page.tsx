import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminSettingsPage() {
  return (
    <RequireAdmin>
      <PageHeader title="Settings" description="Configure the USG notification email and overrides." />
      <PreviewNotice>
        Saving settings is connected once the notification outbox is
        implemented. Values shown are placeholders.
      </PreviewNotice>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification email</CardTitle>
          <CardDescription>
            Where USG receives an email every time a request is submitted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="usg-email">USG notification email</Label>
            <Input id="usg-email" type="email" placeholder="usg@university.edu" disabled />
          </div>
          <Button size="sm" disabled>
            Save changes
          </Button>
        </CardContent>
      </Card>
    </RequireAdmin>
  );
}

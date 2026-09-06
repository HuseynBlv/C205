import { DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/empty-state";
import { fixtureAvailability } from "@/lib/fixtures/data";
import { useFixtures } from "@/lib/config";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default async function AdminAvailabilityPage() {
  const availability = useFixtures ? fixtureAvailability : [];
  const profile = useFixtures ? null : await getCurrentProfile();

  return (
    <RequireAdmin isAdmin={useFixtures ? undefined : isActiveAdmin(profile)}>
      <PageHeader
        title="Availability"
        description="Publish monthly open hours and block dates or hours for C205."
        actions={
          <Button size="sm" disabled>
            Publish availability
          </Button>
        }
      />
      <PreviewNotice>
        Publishing and blocking availability is connected in the booking
        engine step. Closing availability will never silently cancel an
        approved reservation.
      </PreviewNotice>

      {availability.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="No availability published"
          description="Publish open hours for C205 so authorized users can submit requests."
        />
      ) : (
        <div className="space-y-3">
          {availability.map((window) => (
            <Card key={window.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{formatDate(window.date)}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {window.isBlocked
                      ? window.note ?? "Blocked"
                      : `${window.startTime}–${window.endTime}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={window.isBlocked ? "destructive" : "secondary"}>
                    {window.isBlocked ? "Blocked" : "Open"}
                  </Badge>
                  <Button size="sm" variant="outline" disabled>
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RequireAdmin>
  );
}

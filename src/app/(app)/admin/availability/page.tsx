import { DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { fixtureAvailability } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import {
  CreateBlockForm,
  PublishAvailabilityForm,
} from "@/app/(app)/admin/availability/availability-forms";
import { RemoveButton } from "@/app/(app)/admin/availability/remove-button";
import type { Tables } from "@/lib/supabase/database.types";

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatRange(startsAt: string, endsAt: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(new Date(startsAt))} – ${fmt.format(new Date(endsAt))}`;
}

async function RealAvailability({ roomId }: { roomId: string }) {
  const supabase = await createClient();
  const [{ data: windows, error: windowsError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabase
      .from("availability_windows")
      .select("*")
      .eq("room_id", roomId)
      .order("starts_at", { ascending: true }),
    supabase
      .from("blocked_intervals")
      .select("*")
      .eq("room_id", roomId)
      .order("starts_at", { ascending: true }),
  ]);

  if (windowsError || blocksError) {
    return <ErrorState description="We couldn't load availability just now." />;
  }

  const windowRows = (windows ?? []) as Tables<"availability_windows">[];
  const blockRows = (blocks ?? []) as Tables<"blocked_intervals">[];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <PublishAvailabilityForm roomId={roomId} />
        <CreateBlockForm roomId={roomId} />
      </div>

      {windowRows.length === 0 && blockRows.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="No availability published"
          description="Publish open hours for C205 so authorized users can submit requests."
        />
      ) : (
        <div className="space-y-3">
          {windowRows.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {w.label ?? "Availability window"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatRange(w.starts_at, w.ends_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Open</Badge>
                  <RemoveButton id={w.id} kind="window" />
                </div>
              </CardContent>
            </Card>
          ))}
          {blockRows.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{b.reason}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatRange(b.starts_at, b.ends_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Blocked</Badge>
                  <RemoveButton id={b.id} kind="block" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function AdminAvailabilityPage() {
  if (useFixtures) {
    return (
      <RequireAdmin>
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
          Fixture preview — set NEXT_PUBLIC_USE_FIXTURES=false to publish
          and block real availability.
        </PreviewNotice>

        {fixtureAvailability.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="No availability published"
            description="Publish open hours for C205 so authorized users can submit requests."
          />
        ) : (
          <div className="space-y-3">
            {fixtureAvailability.map((window) => (
              <Card key={window.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatDate(window.date)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {window.isBlocked
                        ? (window.note ?? "Blocked")
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

  const profile = await getCurrentProfile();
  const admin = isActiveAdmin(profile);
  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("code", "C205").single();

  return (
    <RequireAdmin isAdmin={admin}>
      <AutoRefresh />
      <PageHeader
        title="Availability"
        description="Publish open hours and block dates or hours for C205."
      />
      {room ? (
        <RealAvailability roomId={room.id} />
      ) : (
        <EmptyState icon={DoorOpen} title="Room not found" description="" />
      )}
    </RequireAdmin>
  );
}

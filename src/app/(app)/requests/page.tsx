import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { fixtureReservations, fixtureCurrentUser } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";

function formatRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

export default function MyRequestsPage() {
  const requests = useFixtures
    ? fixtureReservations.filter((r) => r.requesterId === fixtureCurrentUser.id)
    : [];

  return (
    <div>
      <PageHeader
        title="My Requests"
        description="Every request you've submitted, its decision, and reservation history."
        actions={
          <Button asChild size="sm">
            <Link href="/requests/new">Request C205</Link>
          </Button>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No requests yet"
          description="Submit a request for C205 and track its status here — from Pending through a final decision."
          action={
            <Button asChild size="sm">
              <Link href="/requests/new">Request C205</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{request.purpose}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatRange(request.startsAt, request.endsAt)} · {request.participantCount}{" "}
                    participants
                  </p>
                  {request.status === "REJECTED" && request.rejectionReason ? (
                    <p className="mt-1.5 text-sm text-rose-700">
                      Reason: {request.rejectionReason}
                    </p>
                  ) : null}
                </div>
                <ReservationStatusBadge status={request.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

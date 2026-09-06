import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states/error-state";
import { fixtureReservations, fixtureCurrentUser } from "@/lib/fixtures/data";
import { useFixtures } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/dal";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { RequestsList, type RequestListItem } from "@/app/(app)/requests/requests-list";
import type { Reservation } from "@/lib/booking/actions";

function fromReservationRow(r: Reservation): RequestListItem {
  return {
    id: r.id,
    requesterId: r.requester_id ?? "",
    requesterName: r.requester_name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    purpose: r.purpose,
    participantCount: r.participant_count,
    status: r.status,
    submittedAt: r.submitted_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
    rejectionReason: r.status === "REJECTED" ? r.decision_reason : null,
    adminOverride: r.admin_override,
    overrideReason: r.override_reason,
    version: r.version,
  };
}

export default async function MyRequestsPage() {
  let requests: RequestListItem[] = [];
  let loadError = false;

  if (useFixtures) {
    requests = fixtureReservations
      .filter((r) => r.requesterId === fixtureCurrentUser.id)
      .map((r) => ({ ...r, version: 1 }));
  } else {
    const user = await getVerifiedUser();
    if (user) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("requester_id", user.id)
        .order("submitted_at", { ascending: false });
      if (error) {
        loadError = true;
      } else {
        requests = ((data ?? []) as Reservation[]).map(fromReservationRow);
      }
    }
  }

  return (
    <div>
      {!useFixtures ? <AutoRefresh /> : null}
      <PageHeader
        title="My Requests"
        description="Every request you've submitted, its decision, and reservation history."
        actions={
          <Button asChild size="sm">
            <Link href="/requests/new">Request C205</Link>
          </Button>
        }
      />

      {loadError ? (
        <ErrorState description="We couldn't load your requests just now." />
      ) : (
        <RequestsList requests={requests} />
      )}
    </div>
  );
}

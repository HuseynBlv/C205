"use client";

import { useState } from "react";
import { CheckCircle2, ListChecks, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { fixtureReservations } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";
import type { ReservationRequest, ReservationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

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

/** Local-only optimistic decision — never persisted; a reload resets it. */
type Decision = { status: Extract<ReservationStatus, "APPROVED" | "REJECTED">; justDecided: boolean };

function DecisionCard({
  request,
  decision,
  onApprove,
  onReject,
}: {
  request: ReservationRequest;
  decision?: Decision;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const status = decision?.status ?? request.status;
  return (
    <Card
      className={cn(
        "transition-shadow duration-300",
        decision?.justDecided &&
          (status === "APPROVED"
            ? "shadow-[0_0_0_1px_var(--status-approved),0_0_24px_-8px_var(--status-approved)]"
            : "shadow-[0_0_0_1px_var(--status-rejected),0_0_24px_-8px_var(--status-rejected)]"),
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{request.purpose}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {request.requesterName} · {formatRange(request.startsAt, request.endsAt)}
          </p>
          {request.decidedBy && !decision ? (
            <p className="mt-0.5 text-xs text-muted-foreground">Decided by {request.decidedBy}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ReservationStatusBadge status={status} />
          {onReject && onApprove ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-[color-mix(in_oklab,var(--status-rejected)_55%,var(--border))] text-[var(--status-rejected)] hover:bg-[color-mix(in_oklab,var(--status-rejected)_10%,white)]"
                onClick={onReject}
              >
                <XCircle className="size-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                className="bg-[var(--status-approved)] text-white hover:bg-[var(--status-approved-glow)]"
                onClick={onApprove}
              >
                <CheckCircle2 className="size-3.5" /> Approve
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminReservationsClient({ isAdmin }: { isAdmin?: boolean }) {
  const requests = useFixtures ? fixtureReservations : [];
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const decide = (id: string, status: Decision["status"]) => {
    setDecisions((prev) => ({ ...prev, [id]: { status, justDecided: true } }));
    window.setTimeout(() => {
      setDecisions((prev) =>
        prev[id] ? { ...prev, [id]: { ...prev[id], justDecided: false } } : prev,
      );
    }, 900);
  };

  const pending = requests.filter((r) => r.status === "PENDING" && !decisions[r.id]);
  const decided = requests.filter((r) => r.status !== "PENDING" || decisions[r.id]);

  return (
    <RequireAdmin isAdmin={isAdmin}>
      <PageHeader
        title="Reservations"
        description="Review pending requests and manage the full reservation history."
      />
      <PreviewNotice>
        Approve and Reject below update this screen only, so you can see the
        motion and layout — nothing is persisted or emailed yet. That lands
        with the booking engine step.
      </PreviewNotice>

      {requests.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No reservation activity yet"
          description="Requests will appear here as soon as authorized users start submitting them."
        />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Pending decision ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((request) => (
                <DecisionCard
                  key={request.id}
                  request={request}
                  onApprove={() => decide(request.id, "APPROVED")}
                  onReject={() => decide(request.id, "REJECTED")}
                />
              ))}
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests waiting on a decision.</p>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Decision history</h2>
            <div className="space-y-3">
              {decided.map((request) => (
                <DecisionCard key={request.id} request={request} decision={decisions[request.id]} />
              ))}
            </div>
          </section>
        </div>
      )}
    </RequireAdmin>
  );
}

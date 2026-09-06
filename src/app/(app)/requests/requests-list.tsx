"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/states/empty-state";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { CancelReservationButton } from "@/components/requests/cancel-reservation-button";
import { ROOM_TIMEZONE, useFixtures } from "@/lib/config";
import type { ReservationRequest } from "@/lib/types";

export interface RequestListItem extends ReservationRequest {
  version: number;
}

type Filter = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "PAST";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "PAST", label: "Past" },
];

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

function matchesFilter(request: RequestListItem, filter: Filter, nowMs: number): boolean {
  if (filter === "ALL") return true;
  if (filter === "PAST") return new Date(request.endsAt).getTime() < nowMs;
  return request.status === filter;
}

export function RequestsList({ requests }: { requests: RequestListItem[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  // Stable for the life of this render pass — a request/history filter
  // doesn't need to tick live, just to be consistent within one view.
  const [nowMs] = useState(() => Date.now());

  const filtered = useMemo(
    () => requests.filter((r) => matchesFilter(r, filter, nowMs)),
    [requests, filter, nowMs],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, PAST: 0 };
    for (const r of requests) {
      for (const f of FILTERS) {
        if (matchesFilter(r, f.value, nowMs)) c[f.value] += 1;
      }
    }
    return c;
  }, [requests, nowMs]);

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 sm:w-fit sm:bg-muted sm:p-[3px]">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
              {f.label}
              <span className="text-[10px] text-muted-foreground data-[state=active]:text-current">
                {counts[f.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === "ALL" ? "No requests yet" : "Nothing in this view"}
          description={
            filter === "ALL"
              ? "Submit a request for C205 and track its status here — from Pending through a final decision."
              : "Try a different filter to see your other requests."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/requests/${request.id}`} className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  <p className="truncate text-sm font-medium text-foreground hover:underline">{request.purpose}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatRange(request.startsAt, request.endsAt)} · {request.participantCount}{" "}
                    participants
                  </p>
                  {request.status === "REJECTED" && request.rejectionReason ? (
                    <p className="mt-1.5 text-sm text-[#8a3c37]">
                      Reason: {request.rejectionReason}
                    </p>
                  ) : null}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <ReservationStatusBadge status={request.status} />
                  {!useFixtures && request.status === "APPROVED" ? (
                    <CancelReservationButton reservationId={request.id} expectedVersion={request.version} />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

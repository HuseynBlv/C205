"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { UnarchiveButton } from "@/app/(app)/admin/reservations/decision-buttons";
import { ReservationDetailsSheet } from "@/components/admin/reservation-details-sheet";
import { ROOM_TIMEZONE } from "@/lib/config";
import type { Reservation } from "@/lib/booking/actions";

/** Duplicated from page.tsx rather than passed in as a prop — a Server
 * Component can't hand a plain function to a Client Component across the
 * RSC boundary (only Server Actions cross), and this route is dynamic, so
 * `next build` never actually executes it to catch that at build time. */
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

/** Archived decision-history entries are tucked behind a collapsed toggle
 * by default — the whole point of archiving is a shorter default list, so
 * showing them inline would defeat it. Nothing here is ever deleted;
 * "Unarchive" always brings a row straight back to Decision history. */
export function ArchivedSection({ reservations }: { reservations: Reservation[] }) {
  const [open, setOpen] = useState(false);

  if (reservations.length === 0) return null;

  return (
    <section>
      <Button
        variant="ghost"
        size="sm"
        className="mb-2 h-auto gap-1 px-0 text-sm font-semibold text-foreground hover:bg-transparent"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Archived ({reservations.length})
      </Button>
      {open ? (
        <div className="space-y-3">
          {reservations.map((r) => (
            <Card key={r.id} className="opacity-70">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.requester_name} · {formatRange(r.starts_at, r.ends_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ReservationStatusBadge status={r.status} />
                  <ReservationDetailsSheet
                    reservation={r}
                    trigger={
                      <Button size="sm" variant="ghost">
                        View
                      </Button>
                    }
                  />
                  <UnarchiveButton reservationId={r.id} expectedVersion={r.version} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}

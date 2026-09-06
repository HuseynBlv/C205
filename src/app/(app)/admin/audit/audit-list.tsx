"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/states/empty-state";
import { History } from "lucide-react";
import { ROOM_TIMEZONE } from "@/lib/config";

export interface AuditEventRow {
  id: number;
  occurredAt: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityTable: string;
  entityId: string;
  reason: string | null;
}

type Category = "ALL" | "reservations" | "availability_windows" | "blocked_intervals" | "profiles" | "app_settings";

const CATEGORY_LABELS: Record<Category, string> = {
  ALL: "All",
  reservations: "Reservations",
  availability_windows: "Availability",
  blocked_intervals: "Blocks",
  profiles: "Accounts",
  app_settings: "Settings",
};

const ACTION_LABELS: Record<string, string> = {
  RESERVATION_SUBMITTED: "Reservation submitted",
  RESERVATION_CREATED_MANUALLY: "Reservation booked manually",
  RESERVATION_APPROVED: "Reservation approved",
  RESERVATION_REJECTED: "Reservation rejected",
  RESERVATION_CANCELLED: "Reservation cancelled",
  RESERVATION_MODIFIED: "Reservation modified",
  AVAILABILITY_PUBLISHED: "Availability published",
  AVAILABILITY_UPDATED: "Availability updated",
  AVAILABILITY_REMOVED: "Availability removed",
  AVAILABILITY_MONTH_PUBLISHED: "Monthly availability published",
  BLOCK_CREATED: "Block created",
  BLOCK_UPDATED: "Block updated",
  BLOCK_REMOVED: "Block removed",
  ACCOUNT_STATUS_CHANGED: "Account status changed",
  ROLE_CHANGED: "Role changed",
  SETTINGS_UPDATED: "Settings updated",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function AuditList({ events }: { events: AuditEventRow[] }) {
  const [category, setCategory] = useState<Category>("ALL");

  const categories = useMemo(() => {
    const present = new Set<Category>(["ALL"]);
    for (const e of events) present.add(e.entityTable as Category);
    return (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => present.has(c));
  }, [events]);

  const filtered = category === "ALL" ? events : events.filter((e) => e.entityTable === category);

  return (
    <div className="space-y-4">
      <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 sm:w-fit sm:bg-muted sm:p-[3px]">
          {categories.map((c) => (
            <TabsTrigger key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" description="Administrative and reservation actions will appear here." />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{ACTION_LABELS[e.action] ?? e.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.actorName ?? "System"}
                    {e.actorRole ? ` (${e.actorRole})` : ""} · {e.entityTable}/{e.entityId.slice(0, 8)}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(e.occurredAt)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

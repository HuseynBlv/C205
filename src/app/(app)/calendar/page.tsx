import { CalendarDays, CalendarOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/empty-state";
import { fixtureAvailability } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";

function formatWeekday(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function CalendarPage() {
  const availability = useFixtures ? fixtureAvailability : [];

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={`Published availability for C205 · times shown in ${ROOM_TIMEZONE}`}
      />

      <Card className="mb-6 border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            This preview lists published open hours and blocked dates. The
            full desktop scheduling grid and mobile date-and-time picker for
            submitting a request land in the booking engine step.
          </p>
        </CardContent>
      </Card>

      {availability.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="No availability published"
          description="An administrator hasn't published open hours for C205 yet. Check back soon."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {availability.map((window) => (
            <Card key={window.id} className={window.isBlocked ? "border-rose-200" : undefined}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {formatWeekday(window.date)}
                  </p>
                  {window.isBlocked ? (
                    <p className="mt-1 text-sm text-rose-700">
                      Blocked{window.note ? ` — ${window.note}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {window.startTime}–{window.endTime}
                    </p>
                  )}
                </div>
                <Badge variant={window.isBlocked ? "destructive" : "secondary"}>
                  {window.isBlocked ? "Blocked" : "Open"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

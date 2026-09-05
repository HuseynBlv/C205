import { CalendarOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { EmptyState } from "@/components/states/empty-state";
import { fixtureAvailability } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";

function formatWeekday(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
  });
}

function formatDay(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Position + height (as % of a 7am–9pm window) for the illuminated bar. */
function windowStyle(startTime: string, endTime: string) {
  const dayStart = timeToMinutes("07:00");
  const dayEnd = timeToMinutes("21:00");
  const span = dayEnd - dayStart;
  const top = ((timeToMinutes(startTime) - dayStart) / span) * 100;
  const height = ((timeToMinutes(endTime) - timeToMinutes(startTime)) / span) * 100;
  return {
    top: `${Math.max(0, Math.min(100, top))}%`,
    height: `${Math.max(4, Math.min(100, height))}%`,
  };
}

export default function CalendarPage() {
  const availability = useFixtures ? fixtureAvailability : [];

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={`Published availability for C205 · times shown in ${ROOM_TIMEZONE}`}
      />

      <PreviewNotice>
        This is the published-hours preview. The interactive scheduling grid
        (drag to select a slot, live overlap checks) lands with the booking
        engine step — dates here are read-only fixture data.
      </PreviewNotice>

      {availability.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="No availability published"
          description="An administrator hasn't published open hours for C205 yet. Check back soon."
        />
      ) : (
        <div className="rounded-lg overflow-hidden border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">This week at C205</p>
              <p className="text-xs text-muted-foreground">7:00 AM – 9:00 PM window shown</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" /> Open
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--status-rejected)]" /> Blocked
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div
              className="grid gap-px bg-border p-px"
              style={{ gridTemplateColumns: `repeat(${availability.length}, minmax(140px, 1fr))` }}
            >
            {availability.map((window) => {
              const isBlocked = window.isBlocked;
              const style = isBlocked ? undefined : windowStyle(window.startTime, window.endTime);
              return (
                <div key={window.id} className="flex flex-col bg-card">
                  <div className="border-b border-border px-3 py-2.5 text-center">
                    <p className="text-xs font-semibold text-foreground">{formatWeekday(window.date)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDay(window.date)}</p>
                  </div>
                  <div className="relative m-3 h-48 rounded-lg border border-dashed border-border">
                    {isBlocked ? (
                      <div className="absolute inset-1.5 flex items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--status-rejected)_10%,white)]">
                        <p className="px-2 text-center text-[11px] leading-snug text-[#8a3c37]">
                          Blocked{window.note ? ` — ${window.note}` : ""}
                        </p>
                      </div>
                    ) : (
                      <div
                        className="absolute inset-x-1.5 rounded-md bg-primary/90 shadow-[0_0_18px_-4px_var(--primary)]"
                        style={style}
                      >
                        <p className="p-1.5 text-center text-[10px] font-medium text-primary-foreground">
                          {window.startTime}–{window.endTime}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

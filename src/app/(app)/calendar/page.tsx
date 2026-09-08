import { Suspense } from "react";
import { CalendarOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { CalendarLoadingState } from "@/components/states/loading-state";
import { fixtureAvailability } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { CalendarView, type CalendarEvent } from "@/components/calendar/calendar-view";
import type { BusinessHoursInput } from "@fullcalendar/core";
import type { Tables } from "@/lib/supabase/database.types";
import { formatInTimeZone } from "date-fns-tz";

/** Naive (no offset) Asia/Baku wall-clock string — see calendar-view.tsx's
 * comment on why this, rather than passing the stored UTC ISO string
 * straight through with a "timeZone" prop, is what actually displays the
 * right time to a viewer in any browser timezone. */
function toBakuWallClock(iso: string): string {
  return formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

/** Baku-local time-of-day, in minutes since midnight — for the two purely
 * presentational computations below (the grid's visible hour range, and
 * which weekdays get shaded "unavailable"). Display only: never used for
 * any booking/validation decision. */
function bakuMinutesOfDay(iso: string): number {
  const [h, m] = formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "HH:mm").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeString(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** The calendar's visible hour range — the earliest start / latest end
 * across all published windows, padded by an hour and clamped to a sane
 * bound, rather than an arbitrary fixed 7am-9pm regardless of what's
 * actually published. Falls back to that same 7am-9pm default when
 * nothing's published yet. */
function computeScheduleRange(windows: Tables<"availability_windows">[]): { start: string; end: string } {
  if (windows.length === 0) return { start: "07:00:00", end: "21:00:00" };
  let min = Infinity;
  let max = -Infinity;
  for (const w of windows) {
    min = Math.min(min, bakuMinutesOfDay(w.starts_at));
    max = Math.max(max, bakuMinutesOfDay(w.ends_at));
  }
  return {
    start: minutesToTimeString(Math.min(min - 60, 6 * 60)),
    end: minutesToTimeString(Math.max(max + 60, 22 * 60)),
  };
}

/** One rule per ISO weekday (1=Mon..7=Sun) that has at least one
 * published window, spanning that weekday's own earliest-start/
 * latest-end. A weekday with zero windows gets no rule at all, so
 * FullCalendar shades its entire column with the "unavailable" pattern
 * (calendar.css's `.fc-non-business`) — an approximation ("where
 * practical", per spec) since a day with two disjoint windows collapses
 * into one span, but the precise picture still comes from the actual
 * availability-window background events painted on top. */
function computeBusinessHours(windows: Tables<"availability_windows">[]): BusinessHoursInput {
  const byWeekday = new Map<number, { min: number; max: number }>();
  for (const w of windows) {
    const isoDow = Number(formatInTimeZone(new Date(w.starts_at), ROOM_TIMEZONE, "i"));
    const startMin = bakuMinutesOfDay(w.starts_at);
    const endMin = bakuMinutesOfDay(w.ends_at);
    const existing = byWeekday.get(isoDow);
    byWeekday.set(isoDow, {
      min: existing ? Math.min(existing.min, startMin) : startMin,
      max: existing ? Math.max(existing.max, endMin) : endMin,
    });
  }
  return Array.from(byWeekday.entries()).map(([isoDow, { min, max }]) => ({
    daysOfWeek: [isoDow % 7], // FullCalendar's daysOfWeek is 0=Sun..6=Sat; ISO 7 (Sun) maps to 0
    startTime: minutesToTimeString(min),
    endTime: minutesToTimeString(max),
  }));
}

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

async function RealCalendar() {
  const supabase = await createClient();
  const [
    { data: room },
    { data: windows, error: windowsError },
    { data: blocks, error: blocksError },
    { data: occupancy, error: occupancyError },
  ] = await Promise.all([
    supabase.from("rooms").select("id").eq("code", "C205").single(),
    supabase.from("availability_windows").select("*"),
    supabase.from("blocked_intervals").select("*"),
    supabase.from("room_occupancy").select("*"),
  ]);

  if (windowsError || blocksError || occupancyError) {
    return <ErrorState description="We couldn't load the calendar just now." />;
  }

  const windowRows = (windows ?? []) as Tables<"availability_windows">[];
  const blockRows = (blocks ?? []) as Tables<"blocked_intervals">[];
  const occupancyRows = (occupancy ?? []) as Tables<"room_occupancy">[];

  if (windowRows.length === 0 && occupancyRows.length === 0) {
    return (
      <EmptyState
        icon={CalendarOff}
        title="No availability published"
        description="An administrator hasn't published open hours for C205 yet. Check back soon."
      />
    );
  }

  const events: CalendarEvent[] = [
    ...windowRows.map((w) => ({
      start: toBakuWallClock(w.starts_at),
      end: toBakuWallClock(w.ends_at),
      display: "background" as const,
      backgroundColor: "var(--status-available)",
      title: w.label ?? "Available",
      extendedProps: { kind: "window" },
    })),
    ...blockRows.map((b) => ({
      start: toBakuWallClock(b.starts_at),
      end: toBakuWallClock(b.ends_at),
      display: "background" as const,
      backgroundColor: "var(--status-rejected)",
      title: b.reason,
      extendedProps: { kind: "block" },
    })),
    ...occupancyRows.map((r) => ({
      id: r.id ?? undefined,
      start: r.starts_at ? toBakuWallClock(r.starts_at) : undefined,
      end: r.ends_at ? toBakuWallClock(r.ends_at) : undefined,
      title: r.status === "APPROVED" ? "Reserved" : "Pending",
      backgroundColor: r.status === "APPROVED" ? "var(--status-approved)" : "var(--status-pending)",
      borderColor: r.status === "APPROVED" ? "var(--status-approved)" : "var(--status-pending)",
      textColor: "#ffffff",
      extendedProps: { kind: r.status === "APPROVED" ? "approved" : "pending" },
    })),
  ];

  const { start: scheduleStart, end: scheduleEnd } = computeScheduleRange(windowRows);
  const businessHours = computeBusinessHours(windowRows);

  return (
    <Suspense fallback={<CalendarLoadingState />}>
      <CalendarView
        events={events}
        roomId={room?.id ?? null}
        scheduleStart={scheduleStart}
        scheduleEnd={scheduleEnd}
        businessHours={businessHours}
      />
    </Suspense>
  );
}

export default function CalendarPage() {
  return (
    <div>
      {!useFixtures ? <AutoRefresh /> : null}
      <PageHeader
        title="Calendar"
        description={`Published availability for C205 · times shown in ${ROOM_TIMEZONE}`}
      />

      {useFixtures ? <FixtureCalendar /> : <RealCalendar />}
    </div>
  );
}

function FixtureCalendar() {
  const availability = fixtureAvailability;

  return (
    <div>
      <PreviewNotice>
        This is the published-hours preview using fixture data. Set
        NEXT_PUBLIC_USE_FIXTURES=false to see the real calendar.
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

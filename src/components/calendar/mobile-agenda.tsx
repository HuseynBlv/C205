"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeSlotPicker } from "@/components/booking/time-slot-picker";
import { cn } from "@/lib/utils";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import { generateTimeOptions } from "@/lib/time-options";
import { getSlotStatus } from "@/lib/booking/slot-status";
import { buildDayAvailabilityFromEvents, splitNaive } from "@/lib/booking/day-availability-client";
import { evaluateTimeSelection } from "@/lib/booking/selection-evaluation";
import { NavButton } from "@/components/shared/nav-button";
import type { CalendarEvent } from "@/components/calendar/calendar-view";
import type { CalendarSelection } from "@/components/calendar/selection-panel";

type EntryKind = "window" | "block" | "pending" | "approved";

interface DayEntry {
  id: string | undefined;
  startTime: string;
  endTime: string;
  kind: EntryKind;
  title: string;
}

const KIND_META: Record<EntryKind, { label: string; dotClass: string; textClass: string }> = {
  window: { label: "Available", dotClass: "bg-[var(--status-available)]", textClass: "text-[var(--status-available)]" },
  block: { label: "Unavailable", dotClass: "bg-muted-foreground/40", textClass: "text-muted-foreground" },
  pending: { label: "Pending", dotClass: "bg-[var(--status-pending)]", textClass: "text-[var(--status-pending)]" },
  approved: { label: "Reserved", dotClass: "bg-[var(--status-approved)]", textClass: "text-[var(--status-approved)]" },
};

// The same 30-minute options the request form's own picker offers, capped
// to the same 7am-9pm preview window — see time-slot-picker.tsx's own
// comment. Reused here (rather than the calendar's actual computed
// schedule range) so both tap-to-select surfaces behave identically.
const TIME_OPTIONS = generateTimeOptions(30)
  .map((o) => o.value)
  .filter((v) => v >= "07:00" && v <= "21:00");

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function computeDefaultStart(windowStart: string, isToday: boolean): string {
  const nowHHMM = isToday ? formatInTimeZone(new Date(), ROOM_TIMEZONE, "HH:mm") : "00:00";
  const floor = isToday && nowHHMM > windowStart ? nowHHMM : windowStart;
  return TIME_OPTIONS.find((v) => v >= floor) ?? TIME_OPTIONS[0];
}

function computeDefaultEnd(start: string, windowEnd: string): string {
  const idx = TIME_OPTIONS.indexOf(start);
  const plusHour = idx >= 0 && idx + 2 < TIME_OPTIONS.length ? TIME_OPTIONS[idx + 2] : null;
  if (plusHour && plusHour <= windowEnd) return plusHour;
  return TIME_OPTIONS.find((v) => v > start) ?? start;
}

function addDaysToDateString(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatStripLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
  };
}

function formatFullDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Mobile replacement for the seven-column week grid: a horizontal date
 * strip plus a vertical timeline of the selected day. Reads the exact
 * same `events` the desktop calendar gets — no separate data fetch, no
 * different contract, just a different presentation for narrow screens.
 *
 * Tapping an "Available" entry expands tap-friendly start/end pickers
 * (the same `TimeSlotPicker` the request form uses — no dragging, ever,
 * on mobile) in place, so the mobile flow is date strip → daily timeline
 * → select time → summary bottom sheet (SelectionPanel) → request form,
 * without ever needing the desktop drag-to-select grid.
 */
export function MobileAgenda({
  events,
  roomId,
  selectedDate,
  onSelectedDateChange,
  onSelectEvent,
  onSelectionResult,
}: {
  events: CalendarEvent[];
  /** Needed to revalidate a tapped time range before showing "continue to
   * request" — null only when the room itself hasn't been configured. */
  roomId: string | null;
  /** Lifted to the parent (CalendarView) so desktop's day summary and
   * "Next available" action share the same notion of "focused date". */
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  /** Opens the same privacy-tiered details panel used on desktop, as a
   * bottom sheet — see calendar-view.tsx. */
  onSelectEvent: (id: string) => void;
  /** Hands a revalidated selection up to CalendarView, which renders it
   * via SelectionPanel (a bottom sheet on mobile). */
  onSelectionResult: (selection: CalendarSelection) => void;
}) {
  const todayKey = useMemo(() => formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd"), []);
  const dateStrip = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysToDateString(todayKey, i - 2)),
    [todayKey],
  );

  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickStart, setPickStart] = useState<string | null>(null);
  const [pickEnd, setPickEnd] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => setPickerFor(null));
  }, [selectedDate]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const ev of events) {
      const start = splitNaive(typeof ev.start === "string" ? ev.start : undefined);
      const end = splitNaive(typeof ev.end === "string" ? ev.end : undefined);
      const kind = (ev.extendedProps as { kind?: EntryKind } | undefined)?.kind;
      if (!start || !end || !kind) continue;
      const list = map.get(start.date) ?? [];
      list.push({
        id: typeof ev.id === "string" ? ev.id : undefined,
        startTime: start.time,
        endTime: end.time,
        kind,
        title: String(ev.title ?? ""),
      });
      map.set(start.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [events]);

  const selectedEntries = entriesByDate.get(selectedDate) ?? [];
  const dayAvailability = useMemo(
    () => buildDayAvailabilityFromEvents(events, selectedDate),
    [events, selectedDate],
  );

  function openPicker(entry: DayEntry, index: number) {
    const start = computeDefaultStart(entry.startTime, selectedDate === todayKey);
    setPickerFor(index);
    setPickStart(start);
    setPickEnd(computeDefaultEnd(start, entry.endTime));
  }

  async function reviewTime() {
    if (!pickStart || !pickEnd || pickStart >= pickEnd) return;
    setEvaluating(true);
    const result = await evaluateTimeSelection({ roomId, date: selectedDate, startTime: pickStart, endTime: pickEnd });
    setEvaluating(false);
    setPickerFor(null);
    onSelectionResult(result);
  }

  return (
    <div className="min-w-0">
      <div
        className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-2"
        style={{ scrollSnapType: "x proximity" }}
      >
        {dateStrip.map((dateStr) => {
          const { weekday, day } = formatStripLabel(dateStr);
          const selected = dateStr === selectedDate;
          const isToday = dateStr === todayKey;
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectedDateChange(dateStr)}
              aria-pressed={selected}
              style={{ scrollSnapAlign: "start" }}
              className={cn(
                "flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-2.5 py-1.5 transition-colors",
                selected
                  ? "border-[var(--cal-accent)] bg-[var(--cal-accent)] text-[var(--cal-accent-foreground)]"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wide uppercase",
                  selected ? "opacity-80" : "text-muted-foreground",
                )}
              >
                {weekday}
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold">
                {day}
                {isToday && !selected ? (
                  <span className="size-1.5 rounded-full bg-[var(--cal-accent)]" aria-hidden="true" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        {formatFullDate(selectedDate)} · Times shown in {ROOM_TIMEZONE}
      </p>

      <div className="space-y-2 pb-3">
        {selectedEntries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            {ROOM_NAME} has no published hours on this day.
          </p>
        ) : (
          selectedEntries.map((entry, i) => {
            const meta = KIND_META[entry.kind];
            const isReservation = entry.kind === "pending" || entry.kind === "approved";
            const isWindow = entry.kind === "window";
            const clickable = isReservation && Boolean(entry.id);
            return (
              <div key={i} className="rounded-lg border border-border bg-card p-3">
                <div
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onSelectEvent(entry.id!) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectEvent(entry.id!);
                          }
                        }
                      : undefined
                  }
                  aria-label={
                    clickable
                      ? `${meta.label}, ${formatTime(entry.startTime)} to ${formatTime(entry.endTime)}. View details.`
                      : undefined
                  }
                  className={cn(
                    "flex min-h-11 items-start gap-3",
                    clickable &&
                      "cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cal-accent)]",
                  )}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", meta.dotClass)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                    </p>
                    <p className={cn("text-xs font-medium", meta.textClass)}>
                      {!isReservation && entry.title ? entry.title : meta.label}
                    </p>
                  </div>
                  {isReservation ? (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      <DoorOpen className="size-3" aria-hidden="true" /> {ROOM_NAME}
                    </span>
                  ) : null}
                  {isWindow ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={pickerFor === i ? "secondary" : "outline"}
                      className="h-8 shrink-0"
                      onClick={() => (pickerFor === i ? setPickerFor(null) : openPicker(entry, i))}
                    >
                      {pickerFor === i ? "Close" : "Select time"}
                    </Button>
                  ) : null}
                </div>

                {isWindow && pickerFor === i ? (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Start time</p>
                      <TimeSlotPicker
                        aria-label="Start time"
                        value={pickStart ?? undefined}
                        getStatus={(v) => getSlotStatus(dayAvailability, timeToMinutes(v), timeToMinutes(v) + 30)}
                        onChange={(v) => setPickStart(v)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">End time</p>
                      <TimeSlotPicker
                        aria-label="End time"
                        value={pickEnd ?? undefined}
                        getStatus={(v) => getSlotStatus(dayAvailability, timeToMinutes(v) - 30, timeToMinutes(v))}
                        onChange={(v) => setPickEnd(v)}
                      />
                    </div>
                    {pickStart && pickEnd && pickStart >= pickEnd ? (
                      <p className="text-xs text-destructive">End time must be after the start time.</p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setPickerFor(null)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!pickStart || !pickEnd || pickStart >= pickEnd || evaluating}
                        onClick={() => void reviewTime()}
                      >
                        {evaluating ? "Checking…" : "Review time"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="sticky bottom-20 z-10 mt-1 rounded-xl border border-border bg-card/95 p-2.5 shadow-lg backdrop-blur-sm">
        <NavButton href="/requests/new" className="h-11 w-full">
          Request {ROOM_NAME}
        </NavButton>
      </div>
    </div>
  );
}

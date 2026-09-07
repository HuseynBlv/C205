"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import type { CalendarEvent } from "@/components/calendar/calendar-view";

type EntryKind = "window" | "block" | "pending" | "approved";

interface DayEntry {
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

/** Every calendar event's start/end is already a naive (no offset)
 * Asia/Baku wall-clock string (see calendar-view.tsx's doc comment) —
 * split it as plain text rather than constructing a `Date`, since a
 * bare "YYYY-MM-DDTHH:mm:ss" strings parses as the *browser's* local
 * time in native JS, not the intended Baku time. No Date object is
 * needed here at all: grouping and sorting both work on the strings
 * directly. */
function splitNaive(iso: string | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const [date, time] = iso.split("T");
  if (!date || !time) return null;
  return { date, time: time.slice(0, 5) };
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
 */
export function MobileAgenda({ events }: { events: CalendarEvent[] }) {
  const todayKey = useMemo(() => formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd"), []);
  const dateStrip = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysToDateString(todayKey, i - 2)),
    [todayKey],
  );
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const ev of events) {
      const start = splitNaive(typeof ev.start === "string" ? ev.start : undefined);
      const end = splitNaive(typeof ev.end === "string" ? ev.end : undefined);
      const kind = (ev.extendedProps as { kind?: EntryKind } | undefined)?.kind;
      if (!start || !end || !kind) continue;
      const list = map.get(start.date) ?? [];
      list.push({ startTime: start.time, endTime: end.time, kind, title: String(ev.title ?? "") });
      map.set(start.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [events]);

  const selectedEntries = entriesByDate.get(selectedDate) ?? [];

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
              onClick={() => setSelectedDate(dateStr)}
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
            No published availability or reservations for this day.
          </p>
        ) : (
          selectedEntries.map((entry, i) => {
            const meta = KIND_META[entry.kind];
            const isReservation = entry.kind === "pending" || entry.kind === "approved";
            return (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
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
              </div>
            );
          })
        )}
      </div>

      <div className="sticky bottom-20 z-10 mt-1 rounded-xl border border-border bg-card/95 p-2.5 shadow-lg backdrop-blur-sm">
        <Button asChild className="h-11 w-full">
          <Link href="/requests/new">Request {ROOM_NAME}</Link>
        </Button>
      </div>
    </div>
  );
}

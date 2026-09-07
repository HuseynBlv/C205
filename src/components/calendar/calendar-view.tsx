"use client";

import { useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  BusinessHoursInput,
  DatesSetArg,
  DayCellContentArg,
  DayHeaderContentArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import { DoorOpen } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import { CalendarToolbar, type CalendarViewType } from "@/components/calendar/calendar-toolbar";
import { CalendarLegend } from "@/components/calendar/calendar-legend";
import { MobileAgenda } from "@/components/calendar/mobile-agenda";
import "@/components/calendar/calendar.css";

export type CalendarEvent = EventInput;

/**
 * Read-only: shows published availability (background), blocked time
 * (background), and the anonymized occupancy projection (PENDING/
 * APPROVED, no requester identity — see room_occupancy in the schema).
 * Booking itself still happens on /requests/new.
 *
 * Every event carries `extendedProps.kind` — "window" | "block" |
 * "pending" | "approved" — set by calendar/page.tsx. This is a purely
 * presentational discriminator (which color/label/render-mode to use);
 * it changes nothing about the underlying data or how it was fetched.
 *
 * `timeZone="UTC"` is deliberate, not a bug: FullCalendar's core
 * (without the separate @fullcalendar/moment-timezone plugin, not
 * installed) only understands the literal values "local" and "UTC" for
 * this prop — a named IANA zone like "Asia/Baku" is silently ignored and
 * it falls back to rendering the viewer's own browser timezone, which
 * would show the wrong time to anyone not physically in Baku. The actual
 * fix is in calendar/page.tsx: every event's start/end is pre-formatted
 * into Asia/Baku wall-clock time as a naive (no offset) string there, and
 * "UTC" mode is what makes FullCalendar render naive strings at face
 * value instead of reinterpreting them through the browser's own zone.
 * The same trick is applied to `now` below for the current-time
 * indicator, and to `isSameBakuDay` for "today" highlighting — both
 * must be computed against Baku's current date/time, never the real
 * UTC instant or the browser's local one.
 */
export function CalendarView({
  events,
  scheduleStart = "07:00:00",
  scheduleEnd = "21:00:00",
  businessHours,
}: {
  events: CalendarEvent[];
  /** "HH:mm:ss" — the earliest/latest published hours, computed by the
   * caller from real availability data (falls back to a sensible
   * default when nothing's published yet). */
  scheduleStart?: string;
  scheduleEnd?: string;
  /** Per-weekday published hours, used only to shade days that have no
   * availability at all with the "unavailable" pattern — cosmetic, see
   * calendar.css's `.fc-non-business` rule. */
  businessHours?: BusinessHoursInput;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState<CalendarViewType>("timeGridWeek");
  const [rangeLabel, setRangeLabel] = useState("");
  const [isCurrentPeriod, setIsCurrentPeriod] = useState(true);

  const todayBakuKey = formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd");

  function isSameBakuDay(date: Date): boolean {
    return date.toISOString().slice(0, 10) === todayBakuKey;
  }

  function fakeBakuNow(): Date {
    return new Date(`${formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss")}Z`);
  }

  function handleDatesSet(arg: DatesSetArg) {
    setView(arg.view.type as CalendarViewType);
    if (arg.view.type === "dayGridMonth") {
      setRangeLabel(
        new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
          arg.view.currentStart,
        ),
      );
    } else {
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
      const start = arg.view.currentStart;
      const end = new Date(arg.view.currentEnd.getTime() - 24 * 60 * 60 * 1000);
      const year = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric" }).format(end);
      setRangeLabel(`${fmt.format(start)} – ${fmt.format(end)}, ${year}`);
    }
    const todayFake = new Date(`${todayBakuKey}T12:00:00Z`);
    setIsCurrentPeriod(todayFake >= arg.view.currentStart && todayFake < arg.view.currentEnd);
  }

  function goPrev() {
    calendarRef.current?.getApi().prev();
  }
  function goNext() {
    calendarRef.current?.getApi().next();
  }
  function goToday() {
    calendarRef.current?.getApi().today();
  }
  function changeView(next: CalendarViewType) {
    calendarRef.current?.getApi().changeView(next);
  }

  function renderEventContent(arg: EventContentArg) {
    const kind = arg.event.extendedProps?.kind as string | undefined;
    if (kind !== "pending" && kind !== "approved") return undefined; // background events: default rendering (color only)

    const durationMinutes =
      arg.event.start && arg.event.end ? (arg.event.end.getTime() - arg.event.start.getTime()) / 60000 : 0;
    const compact = arg.view.type === "dayGridMonth" || (durationMinutes > 0 && durationMinutes < 40);

    if (compact) {
      return (
        <div className="cal-event-compact">
          <span className="cal-event-dot" aria-hidden="true" />
          <span>{arg.timeText || arg.event.title}</span>
        </div>
      );
    }

    return (
      <div className="cal-event">
        <div className="cal-event-row">
          <span className="cal-event-dot" aria-hidden="true" />
          <span className="cal-event-time">{arg.timeText}</span>
        </div>
        <div className="cal-event-title">{arg.event.title}</div>
        <div className="cal-event-room">
          <DoorOpen className="size-2.5" aria-hidden="true" />
          {ROOM_NAME}
        </div>
      </div>
    );
  }

  // Branch on `arg.view.type` (FullCalendar's own live value for whatever
  // it's currently drawing) rather than on the `view` React state — the
  // two content-generation callbacks below are registered unconditionally
  // for every view, since swapping the prop itself between `undefined`
  // and a function based on state raced with FullCalendar's internal
  // view-change timing and briefly rendered the week-view header (small
  // label + big date number) inside the month view too.
  function dayHeaderContent(arg: DayHeaderContentArg) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(arg.date);
    if (arg.view.type !== "timeGridWeek") {
      return <span className="text-xs font-medium text-muted-foreground">{weekday}</span>;
    }
    const today = isSameBakuDay(arg.date);
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{weekday}</span>
        <span
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold",
            today ? "cal-today-badge" : "text-foreground",
          )}
        >
          {arg.date.getUTCDate()}
        </span>
      </div>
    );
  }

  function dayCellContent(arg: DayCellContentArg) {
    if (arg.view.type !== "dayGridMonth") return undefined;
    const today = isSameBakuDay(arg.date);
    return (
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-xs font-medium",
          today ? "cal-today-badge" : arg.isOther ? "text-muted-foreground/50" : "text-foreground",
        )}
      >
        {arg.dayNumberText.replace(/\D/g, "")}
      </span>
    );
  }

  return (
    <div>
      <div className="hidden md:block">
        <CalendarToolbar
          rangeLabel={rangeLabel}
          view={view}
          isCurrentPeriod={isCurrentPeriod}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onChangeView={changeView}
        />
        <div className="c205-calendar-shell">
          <div className="c205-calendar rounded-xl border border-border p-2 shadow-sm">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={false}
              height="auto"
              timeZone="UTC"
              now={fakeBakuNow}
              slotMinTime={scheduleStart}
              slotMaxTime={scheduleEnd}
              allDaySlot={false}
              businessHours={businessHours}
              nowIndicator
              events={events}
              eventDisplay="block"
              dayMaxEventRows={3}
              eventContent={renderEventContent}
              dayHeaderContent={dayHeaderContent}
              dayCellContent={dayCellContent}
              datesSet={handleDatesSet}
            />
          </div>
        </div>
      </div>

      <div className="min-w-0 md:hidden">
        <MobileAgenda events={events} />
      </div>

      <CalendarLegend className="mt-3" />
    </div>
  );
}

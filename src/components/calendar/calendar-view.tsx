"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  BusinessHoursInput,
  DateSelectArg,
  DatesSetArg,
  DayCellContentArg,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
} from "@fullcalendar/core";
import { DoorOpen } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import { roomLocalToUtcIso } from "@/lib/booking/timezone";
import { mapBookingError } from "@/lib/booking/errors";
import { evaluateRequestedRange } from "@/lib/booking/slot-status";
import { getDayAvailabilityAction } from "@/lib/booking/availability-query";
import { CalendarToolbar, type CalendarViewType } from "@/components/calendar/calendar-toolbar";
import { CalendarLegend } from "@/components/calendar/calendar-legend";
import { MobileAgenda } from "@/components/calendar/mobile-agenda";
import { ReservationPanel, type ReservationFallback } from "@/components/calendar/reservation-panel";
import { SelectionPanel, type CalendarSelection } from "@/components/calendar/selection-panel";
import "@/components/calendar/calendar.css";

export type CalendarEvent = EventInput;

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatEventTimeRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return "";
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

interface HoverPreview {
  id: string;
  x: number;
  y: number;
  title: string;
  timeRange: string;
}

/**
 * Read-only booking data, but meaningfully interactive: clicking a
 * reservation opens a privacy-tiered details panel (ReservationPanel),
 * and selecting an available time opens a request summary
 * (SelectionPanel). Neither interaction changes what's fetched here —
 * the panel does its own authorization-scoped fetch
 * (getReservationDetailsAction), and the selection summary revalidates
 * nothing itself, just previews using the same day-availability data the
 * request form's own picker uses, then hands off to /requests/new for
 * the real (authoritative) submission.
 *
 * Every event carries `extendedProps.kind` — "window" | "block" |
 * "pending" | "approved" — set by calendar/page.tsx. This is a purely
 * presentational discriminator; it changes nothing about the underlying
 * data or how it was fetched.
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
 * UTC instant or the browser's local one. Selection handling below
 * converts back to a real, absolute UTC instant via `roomLocalToUtcIso`
 * before ever comparing against "now" or calling a server action — the
 * naive strings are a display trick only, never used as real timestamps.
 */
export function CalendarView({
  events,
  roomId,
  scheduleStart = "07:00:00",
  scheduleEnd = "21:00:00",
  businessHours,
}: {
  events: CalendarEvent[];
  /** Needed to revalidate a selected time range against real availability
   * before showing "continue to request" — null only when the room
   * itself hasn't been configured yet. */
  roomId: string | null;
  scheduleStart?: string;
  scheduleEnd?: string;
  businessHours?: BusinessHoursInput;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedEventId = searchParams.get("event");

  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState<CalendarViewType>("timeGridWeek");
  const [rangeLabel, setRangeLabel] = useState("");
  const [isCurrentPeriod, setIsCurrentPeriod] = useState(true);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const prevSelectedEventIdRef = useRef<string | null>(null);

  const todayBakuKey = formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd");

  function isSameBakuDay(date: Date): boolean {
    return date.toISOString().slice(0, 10) === todayBakuKey;
  }

  function fakeBakuNow(): Date {
    return new Date(`${formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss")}Z`);
  }

  // The minimal, already-privacy-safe fields for whichever event is
  // currently selected — derived from `events` (sourced from
  // room_occupancy, which never carried requester identity/purpose to
  // begin with), not from click-time state. This is what makes the
  // panel work correctly after a direct URL load or browser back/
  // forward, not just a same-session click. Converts the naive Baku
  // wall-clock strings back into real, absolute UTC timestamps —
  // ReservationPanel's formatting assumes real ISO instants, matching
  // what the authorized-fetch path (getReservationDetailsAction) returns.
  const selectedEventFallback: ReservationFallback | null = useMemo(() => {
    if (!selectedEventId) return null;
    const found = events.find((e) => e.id === selectedEventId);
    if (!found || typeof found.start !== "string" || typeof found.end !== "string") return null;
    const kind = (found.extendedProps as { kind?: string } | undefined)?.kind;
    if (kind !== "pending" && kind !== "approved") return null;
    const [startDate, startTime] = found.start.split("T");
    const [endDate, endTime] = found.end.split("T");
    return {
      status: kind === "approved" ? "APPROVED" : "PENDING",
      startsAt: roomLocalToUtcIso(startDate, startTime.slice(0, 5)),
      endsAt: roomLocalToUtcIso(endDate, endTime.slice(0, 5)),
    };
  }, [events, selectedEventId]);

  function openEvent(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("event", id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeEvent() {
    router.back();
  }

  // Return focus to the reservation that was open once the panel closes
  // — by any of the four routes (close button, Escape, outside click, or
  // real browser back), all of which end up here as the same URL
  // transition from "?event=<id>" to no `event` param. Looked up by a
  // `data-event-id` attribute (see eventDidMount) rather than a stored
  // DOM ref, since FullCalendar can recreate an event's DOM node between
  // open and close (e.g. a periodic refresh).
  useEffect(() => {
    const prev = prevSelectedEventIdRef.current;
    if (prev && !selectedEventId) {
      const el = document.querySelector(`[data-event-id="${prev}"]`) as HTMLElement | null;
      el?.focus();
    }
    prevSelectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

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

  function handleEventClick(info: EventClickArg) {
    const kind = info.event.extendedProps?.kind as string | undefined;
    if (kind !== "pending" && kind !== "approved") return;
    info.jsEvent.preventDefault();
    openEvent(info.event.id);
  }

  function eventDidMount(info: EventMountArg) {
    const kind = info.event.extendedProps?.kind as string | undefined;
    if (kind !== "pending" && kind !== "approved") return;

    info.el.dataset.eventId = info.event.id;
    info.el.setAttribute("role", "button");
    info.el.setAttribute("tabindex", "0");
    info.el.classList.add("cal-event-interactive");
    const statusLabel = kind === "approved" ? "Reserved" : "Pending request";
    info.el.setAttribute(
      "aria-label",
      `${statusLabel}, ${formatEventTimeRange(info.event.start, info.event.end)}. Press Enter for details.`,
    );

    info.el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEvent(info.event.id);
      }
    });

    info.el.addEventListener("mouseenter", () => {
      const rect = info.el.getBoundingClientRect();
      setHoverPreview({
        id: info.event.id,
        x: rect.left + rect.width / 2,
        y: rect.top,
        title: kind === "approved" ? `${ROOM_NAME} is reserved` : `${ROOM_NAME} has a pending request`,
        timeRange: formatEventTimeRange(info.event.start, info.event.end),
      });
    });
    info.el.addEventListener("mouseleave", () => {
      setHoverPreview((h) => (h?.id === info.event.id ? null : h));
    });
  }

  async function handleSelect(info: DateSelectArg) {
    setHoverPreview(null);
    const startDate = info.start;
    const endDate = info.end;
    const dateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = endDate.toISOString().slice(0, 10);
    const startTime = startDate.toISOString().slice(11, 16);
    const endTime = endDate.toISOString().slice(11, 16);

    if (endDateStr !== dateStr) {
      setSelection({
        date: dateStr,
        startTime,
        endTime: "23:59",
        blockedReason: "Select a time within a single day.",
        note: null,
      });
      return;
    }

    const startsAtIso = roomLocalToUtcIso(dateStr, startTime);
    const endsAtIso = roomLocalToUtcIso(dateStr, endTime);

    if (new Date(startsAtIso).getTime() < Date.now()) {
      setSelection({
        date: dateStr,
        startTime,
        endTime,
        blockedReason: "That time has already passed — pick a time in the future.",
        note: null,
      });
      return;
    }

    if (!roomId) {
      setSelection({
        date: dateStr,
        startTime,
        endTime,
        blockedReason: `${ROOM_NAME} isn't configured yet. Contact an administrator.`,
        note: null,
      });
      return;
    }

    const dayResult = await getDayAvailabilityAction({ roomId, date: dateStr });
    if (!dayResult.ok) {
      setSelection({ date: dateStr, startTime, endTime, blockedReason: dayResult.error, note: null });
      return;
    }

    const evaluation = evaluateRequestedRange(dayResult.data, timeToMinutes(startTime), timeToMinutes(endTime), {
      startsAtMs: new Date(startsAtIso).getTime(),
      endsAtMs: new Date(endsAtIso).getTime(),
      nowMs: Date.now(),
    });

    if (evaluation.code === "OUTSIDE_AVAILABILITY" || evaluation.code === "RESERVATION_CONFLICT") {
      setSelection({ date: dateStr, startTime, endTime, blockedReason: mapBookingError(evaluation.code), note: null });
      return;
    }

    setSelection({
      date: dateStr,
      startTime,
      endTime,
      blockedReason: null,
      note:
        evaluation.code === "ADVANCE_NOTICE_REQUIRED"
          ? mapBookingError("ADVANCE_NOTICE_REQUIRED")
          : evaluation.overlapsPending
            ? "This overlaps another pending request — you can still request it; USG decides in submission order."
            : null,
    });
  }

  function dismissSelection() {
    setSelection(null);
    calendarRef.current?.getApi().unselect();
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
      {selection ? <SelectionPanel selection={selection} onDismiss={dismissSelection} /> : null}

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
              selectable
              views={{ dayGridMonth: { selectable: false } }}
              select={handleSelect}
              eventClick={handleEventClick}
              eventDidMount={eventDidMount}
              eventClassNames={(arg) => (arg.event.id === selectedEventId ? ["cal-event-selected"] : [])}
              eventContent={renderEventContent}
              dayHeaderContent={dayHeaderContent}
              dayCellContent={dayCellContent}
              datesSet={handleDatesSet}
            />
          </div>
        </div>

        {hoverPreview ? (
          <div
            className="cal-hover-preview hidden md:block"
            style={{ left: hoverPreview.x, top: hoverPreview.y }}
            role="presentation"
          >
            <p className="font-medium">{hoverPreview.title}</p>
            <p className="text-muted-foreground">{hoverPreview.timeRange}</p>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 md:hidden">
        <MobileAgenda events={events} onSelectEvent={openEvent} />
      </div>

      <CalendarLegend className="mt-3" />

      <ReservationPanel
        reservationId={selectedEventId}
        fallback={selectedEventFallback}
        open={Boolean(selectedEventId)}
        onOpenChange={(open) => {
          if (!open) closeEvent();
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
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
import { evaluateTimeSelection } from "@/lib/booking/selection-evaluation";
import { computeDaySummary, type DaySummary } from "@/lib/booking/day-availability-client";
import { findNextAvailableSlot, type NextAvailableSlot } from "@/lib/booking/next-available";
import { CalendarToolbar, type CalendarViewType } from "@/components/calendar/calendar-toolbar";
import { CalendarDaySummary } from "@/components/calendar/calendar-day-summary";
import { CalendarLegend } from "@/components/calendar/calendar-legend";
import { MobileAgenda } from "@/components/calendar/mobile-agenda";
import { ReservationPanel, type ReservationFallback } from "@/components/calendar/reservation-panel";
import { SelectionPanel, type CalendarSelection } from "@/components/calendar/selection-panel";
import "@/components/calendar/calendar.css";

export type CalendarEvent = EventInput;

const VIEW_STORAGE_KEY = "c205.calendar.view";

interface StoredView {
  view: CalendarViewType;
  date: string;
}

function readStoredView(): StoredView | null {
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredView>;
    if (parsed.view !== "timeGridWeek" && parsed.view !== "dayGridMonth") return null;
    if (typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) return null;
    return { view: parsed.view, date: parsed.date };
  } catch {
    return null;
  }
}

function writeStoredView(value: StoredView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private browsing / storage disabled — remembering the view is a
    // convenience, not a requirement, so a write failure is silently
    // ignored rather than surfaced anywhere.
  }
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
  const explicitFocusRef = useRef<string | null>(null);

  const todayBakuKey = formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd");
  const [focusedDate, setFocusedDate] = useState(todayBakuKey);

  // "Now" lives in state, refreshed via effect, rather than calling
  // Date.now() directly during render (react-hooks/purity) — same pattern
  // used throughout this project (e.g. request-form.tsx's live preview).
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() => setNowMs(Date.now()));
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  function isSameBakuDay(date: Date): boolean {
    return date.toISOString().slice(0, 10) === todayBakuKey;
  }

  function fakeBakuNow(): Date {
    return new Date(`${formatInTimeZone(new Date(), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss")}Z`);
  }

  // Restore the last view/date this device looked at (localStorage — a
  // per-device convenience, nothing server-side). Deferred to a mount
  // effect rather than an `initialView`/`initialDate` prop: those need a
  // value before FullCalendar's first client render, and reading
  // localStorage there would differ between server- and client-rendered
  // output. The one-time visible snap from "this week" to the restored
  // view is an accepted trade-off for staying SSR-safe.
  useEffect(() => {
    const stored = readStoredView();
    if (!stored) return;
    calendarRef.current?.getApi().changeView(stored.view, stored.date);
  }, []);

  const daySummaryFor = useMemo(() => {
    // Elapsed-minutes-since-midnight must come from Baku's own wall clock
    // (formatInTimeZone), not ms arithmetic against a UTC-parsed "T00:00:00Z"
    // string — that string is Baku's 4am, not its midnight, and using it
    // directly silently shifted every "now" cutoff by the zone's offset
    // (caught live: the day summary read "9:58 AM" while the grid's own
    // now-indicator correctly sat near 2pm).
    const nowBakuMinutes =
      nowMs !== null
        ? Number(formatInTimeZone(nowMs, ROOM_TIMEZONE, "H")) * 60 + Number(formatInTimeZone(nowMs, ROOM_TIMEZONE, "m"))
        : undefined;
    return (dateStr: string): DaySummary => {
      const elapsed = dateStr === todayBakuKey ? nowBakuMinutes : undefined;
      return computeDaySummary(events, dateStr, elapsed);
    };
  }, [events, nowMs, todayBakuKey]);

  const focusedSummary = useMemo(() => daySummaryFor(focusedDate), [daySummaryFor, focusedDate]);

  const nextAvailable: NextAvailableSlot | null = useMemo(
    () => (nowMs === null ? null : findNextAvailableSlot(events, nowMs)),
    [events, nowMs],
  );

  // One summary per date that has any published window/reservation —
  // computed once per `events` change, looked up per month-view cell
  // (dayCellContent below) rather than recomputed per cell.
  const monthSummaries = useMemo(() => {
    const dates = new Set<string>();
    for (const ev of events) {
      const start = typeof ev.start === "string" ? ev.start.slice(0, 10) : undefined;
      if (start) dates.add(start);
    }
    const map = new Map<string, DaySummary>();
    for (const date of dates) map.set(date, daySummaryFor(date));
    return map;
  }, [events, daySummaryFor]);

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
    // A deterministic push to the event-less URL, not router.back(): a
    // panel opened via a deep link (e.g. the request form's "View on
    // calendar", which pushes straight to "?event=<id>" with no plain
    // "/calendar" entry beneath it in history) would otherwise send the
    // in-app close button back to whatever page preceded that link —
    // caught live by actually using "View on calendar" and closing the
    // panel, not by reasoning about it. The *browser's own* back/forward
    // buttons are unaffected: they update the URL via popstate directly,
    // a separate path from this function entirely.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("event");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
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
    const nextView = arg.view.type as CalendarViewType;
    setView(nextView);
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
    const currentPeriod = todayFake >= arg.view.currentStart && todayFake < arg.view.currentEnd;
    setIsCurrentPeriod(currentPeriod);
    // A dateClick or "Next available" jump already set exactly the date the
    // user meant to focus on — this datesSet firing right after (from the
    // resulting changeView call) must not clobber it back to "today" just
    // because today also happens to fall inside the resulting week.
    if (explicitFocusRef.current) {
      explicitFocusRef.current = null;
    } else {
      setFocusedDate(currentPeriod ? todayBakuKey : arg.view.currentStart.toISOString().slice(0, 10));
    }
    writeStoredView({ view: nextView, date: arg.view.currentStart.toISOString().slice(0, 10) });

    // Bring "now" (or, failing that, the start of published hours) into
    // view without requiring a manual scroll — only meaningful in the
    // week view, and only once the grid has actually painted. `smooth`
    // is an explicit scrollIntoView option, so it overrides the global
    // `prefers-reduced-motion` CSS rule (globals.css) rather than being
    // caught by it — checked directly here instead.
    if (nextView === "timeGridWeek") {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => {
        const anchor =
          document.querySelector(".c205-calendar .fc-timegrid-now-indicator-arrow") ??
          document.querySelector(".c205-calendar .fc-timegrid-slot");
        anchor?.scrollIntoView({ block: "center", behavior: reduceMotion ? "instant" : "smooth" });
      });
    }
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

  function jumpToNextAvailable(slot: NextAvailableSlot) {
    explicitFocusRef.current = slot.date;
    setFocusedDate(slot.date);
    calendarRef.current?.getApi().changeView("timeGridWeek", slot.date);
  }

  function handleDateClick(arg: DateClickArg) {
    if (arg.view.type !== "dayGridMonth") return;
    const dateStr = arg.date.toISOString().slice(0, 10);
    explicitFocusRef.current = dateStr;
    setFocusedDate(dateStr);
    calendarRef.current?.getApi().changeView("timeGridWeek", dateStr);
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

    setSelection(await evaluateTimeSelection({ roomId, date: dateStr, startTime, endTime }));
  }

  function dismissSelection() {
    setSelection(null);
    calendarRef.current?.getApi().unselect();
  }

  function renderEventContent(arg: EventContentArg) {
    const kind = arg.event.extendedProps?.kind as string | undefined;
    if (kind !== "pending" && kind !== "approved") return undefined; // background events: default rendering (color only)
    if (arg.view.type === "dayGridMonth") return undefined; // month view: dot indicators in dayCellContent instead

    const durationMinutes =
      arg.event.start && arg.event.end ? (arg.event.end.getTime() - arg.event.start.getTime()) / 60000 : 0;
    const compact = durationMinutes > 0 && durationMinutes < 40;

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

  // Month view: a date number plus a compact row of colored dots — never
  // per-event text (see calendar.css, which hides raw event chips in
  // month view entirely) — "3 open" would still be too busy across 42
  // cells, so this stays dot-only, with the fuller wording reserved for
  // CalendarDaySummary above the grid.
  function dayCellContent(arg: DayCellContentArg) {
    if (arg.view.type !== "dayGridMonth") return undefined;
    const today = isSameBakuDay(arg.date);
    const dateKey = arg.date.toISOString().slice(0, 10);
    const summary = monthSummaries.get(dateKey);
    return (
      <div className="flex h-full flex-col items-center gap-1 pt-0.5">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-medium",
            today ? "cal-today-badge" : arg.isOther ? "text-muted-foreground/50" : "text-foreground",
          )}
        >
          {arg.dayNumberText.replace(/\D/g, "")}
        </span>
        {summary && (summary.hasWindows || summary.pendingCount > 0 || summary.approvedCount > 0) ? (
          <span className="flex items-center gap-1" aria-hidden="true">
            {summary.hasWindows && summary.openRanges.length > 0 ? (
              <span className="size-1.5 rounded-full bg-[var(--status-available)]" />
            ) : null}
            {summary.pendingCount > 0 ? <span className="size-1.5 rounded-full bg-[var(--status-pending)]" /> : null}
            {summary.approvedCount > 0 ? <span className="size-1.5 rounded-full bg-[var(--status-approved)]" /> : null}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {selection ? <SelectionPanel selection={selection} onDismiss={dismissSelection} /> : null}

      <div className="hidden md:block">
        <div className="sticky top-0 z-20 bg-background pb-1">
          <CalendarToolbar
            rangeLabel={rangeLabel}
            view={view}
            isCurrentPeriod={isCurrentPeriod}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onChangeView={changeView}
          />
        </div>

        <CalendarDaySummary
          dateStr={focusedDate}
          summary={focusedSummary}
          nextAvailable={nextAvailable}
          onJumpToNextAvailable={jumpToNextAvailable}
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
              dateClick={handleDateClick}
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
        <MobileAgenda
          events={events}
          roomId={roomId}
          selectedDate={focusedDate}
          onSelectedDateChange={setFocusedDate}
          onSelectEvent={openEvent}
          onSelectionResult={setSelection}
        />
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

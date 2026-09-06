"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";

export type CalendarEvent = EventInput;

/**
 * Read-only for now: shows published availability (background), blocked
 * time (background), and the anonymized occupancy projection (PENDING/
 * APPROVED, no requester identity — see room_occupancy in the schema).
 * Booking itself still happens on /requests/new; this is the "see what's
 * open" desktop view FullCalendar was installed for back in Step 1.
 *
 * `timeZone="UTC"` here is deliberate, not a bug: FullCalendar's core
 * (without the separate @fullcalendar/moment-timezone plugin, not
 * installed) only understands the literal values "local" and "UTC" for
 * this prop — a named IANA zone like "Asia/Baku" is silently ignored and
 * it falls back to rendering the viewer's own browser timezone, which
 * would show the wrong time to anyone not physically in Baku. The actual
 * fix is in calendar/page.tsx: every event's start/end is pre-formatted
 * into Asia/Baku wall-clock time as a naive (no offset) string there, and
 * "UTC" mode is what makes FullCalendar render naive strings at face
 * value instead of reinterpreting them through the browser's own zone.
 */
export function CalendarView({ events }: { events: CalendarEvent[] }) {
  return (
    <div className="c205-calendar rounded-lg border border-border bg-card p-2">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridWeek,dayGridMonth",
        }}
        height="auto"
        timeZone="UTC"
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        nowIndicator
        events={events}
        eventDisplay="block"
      />
    </div>
  );
}

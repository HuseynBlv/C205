"use client";

import { AlertTriangle, ArrowRight, CalendarClock, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { NavButton } from "@/components/shared/nav-button";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import { cn } from "@/lib/utils";

export interface CalendarSelection {
  date: string;
  startTime: string;
  endTime: string;
  /** `null` means the range can be requested; anything else is a specific,
   * short reason it can't, shown with an icon — never color alone. */
  blockedReason: string | null;
  /** Non-blocking heads-up shown alongside a valid selection (e.g. it
   * overlaps another pending request — still requestable). */
  note: string | null;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDuration(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function ContinueLink({ selection }: { selection: CalendarSelection }) {
  return (
    <NavButton
      size="sm"
      href={`/requests/new?date=${selection.date}&start=${selection.startTime}&end=${selection.endTime}`}
    >
      Continue to request
      <ArrowRight className="size-3.5" />
    </NavButton>
  );
}

function SummaryBody({ selection }: { selection: CalendarSelection }) {
  const isBlocked = selection.blockedReason !== null;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          isBlocked ? "bg-destructive/10 text-destructive" : "bg-[var(--cal-accent)]/15 text-[var(--cal-accent)]",
        )}
      >
        {isBlocked ? <AlertTriangle className="size-4" /> : <CalendarClock className="size-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {formatDate(selection.date)} · {formatTime(selection.startTime)}–{formatTime(selection.endTime)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDuration(selection.startTime, selection.endTime)} · {ROOM_TIMEZONE}
        </p>
        {isBlocked ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {selection.blockedReason}
          </p>
        ) : selection.note ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {selection.note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Appears the moment a user selects an available time — either a
 * "continue to request" summary (valid selection, cobalt accent echoing
 * the calendar's own highlight) or a short, specific, icon-paired
 * explanation (invalid selection: past, blocked, outside availability, or
 * conflicting with an approved reservation). Never opens `/requests/new`
 * directly — that page revalidates the interval itself against live data
 * before ever calling `submit_request`.
 *
 * Desktop: an inline banner at the top of the calendar. Mobile: a genuine
 * bottom sheet (per the interactivity brief's "summary bottom sheet" step
 * in the mobile flow), reusing the same `Sheet` primitive the reservation
 * details panel uses.
 */
export function SelectionPanel({ selection, onDismiss }: { selection: CalendarSelection; onDismiss: () => void }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isBlocked = selection.blockedReason !== null;

  if (!isDesktop) {
    return (
      <Sheet open onOpenChange={(open) => !open && onDismiss()}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{isBlocked ? "Not available" : "Review this time"}</SheetTitle>
            <SheetDescription className="sr-only">Selected time summary</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <SummaryBody selection={selection} />
            {!isBlocked ? (
              <div className="flex justify-end">
                <ContinueLink selection={selection} />
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-2 mb-3 flex flex-col gap-3 rounded-xl border p-4 duration-200 sm:flex-row sm:items-center sm:justify-between",
        isBlocked
          ? "border-destructive/30 bg-destructive/5"
          : "border-[var(--cal-accent)]/40 bg-[color-mix(in_oklab,var(--cal-accent)_6%,var(--cal-surface))]",
      )}
    >
      <SummaryBody selection={selection} />
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {!isBlocked ? <ContinueLink selection={selection} /> : null}
        <Button size="sm" variant="ghost" onClick={onDismiss} aria-label={`Dismiss ${ROOM_NAME} time selection`}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

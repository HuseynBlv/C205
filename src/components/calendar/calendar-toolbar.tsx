"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROOM_TIMEZONE } from "@/lib/config";

export type CalendarViewType = "timeGridWeek" | "dayGridMonth";

/**
 * Replaces FullCalendar's default toolbar (title + six buttons, sized for
 * a full standalone calendar app) with a compact bar sized for a page
 * that also has its own PageHeader above it. Drives the calendar purely
 * through the FullCalendar API (see calendar-view.tsx's ref calls) — this
 * component holds no calendar state of its own.
 */
export function CalendarToolbar({
  rangeLabel,
  view,
  isCurrentPeriod,
  onPrev,
  onNext,
  onToday,
  onChangeView,
}: {
  rangeLabel: string;
  view: CalendarViewType;
  isCurrentPeriod: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChangeView: (view: CalendarViewType) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-2.5">
        <div className="inline-flex items-center overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            aria-label="Previous period"
            onClick={onPrev}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="h-4 w-px bg-border" aria-hidden="true" />
          <button
            type="button"
            aria-label="Next period"
            onClick={onNext}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          variant={isCurrentPeriod ? "secondary" : "outline"}
          aria-pressed={isCurrentPeriod}
          onClick={onToday}
        >
          Today
        </Button>

        <span className="text-sm font-medium text-muted-foreground">{rangeLabel}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-[11px] text-muted-foreground/80 sm:inline">
          Times shown in {ROOM_TIMEZONE}
        </span>
        <Tabs value={view} onValueChange={(v) => onChangeView(v as CalendarViewType)}>
          <TabsList>
            <TabsTrigger value="timeGridWeek">Week</TabsTrigger>
            <TabsTrigger value="dayGridMonth">Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { Ban, Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateTimeOptions } from "@/lib/time-options";
import { ROOM_OPEN_TIME, ROOM_CLOSE_TIME } from "@/lib/config";
import type { SlotStatus } from "@/lib/booking/slot-status";

const allOptions = generateTimeOptions(30);
// The room's fixed operating hours — nothing outside this range can ever
// actually be booked (see ROOM_OPEN_TIME/ROOM_CLOSE_TIME's own comment),
// so it's never offered as a choice here either.
const options = allOptions.filter((o) => o.value >= ROOM_OPEN_TIME && o.value <= ROOM_CLOSE_TIME);

const STATUS_META: Record<SlotStatus, { label: string; icon: React.ElementType; className: string }> = {
  available: {
    label: "Open",
    icon: Check,
    className: "border-[var(--status-available)]/50 text-[var(--status-available)]",
  },
  pending: {
    label: "Pending request",
    icon: Clock,
    className: "border-[var(--status-pending)]/60 text-[var(--status-pending)]",
  },
  approved: {
    label: "Reserved",
    icon: Ban,
    className: "border-[var(--status-approved)]/60 text-[var(--status-approved)]",
  },
  unavailable: {
    label: "Unavailable",
    icon: X,
    className: "border-border text-muted-foreground/70",
  },
};

/**
 * Time slots rendered as a horizontally scrollable row of small buttons
 * rather than a plain dropdown, so the full range stays scannable. Each
 * option optionally carries a live availability status (color + icon +
 * accessible label, never color alone) computed from real published
 * availability / blocks / anonymized occupancy for the selected day.
 */
export function TimeSlotPicker({
  value,
  onChange,
  disabled,
  getStatus,
  "aria-label": ariaLabel,
}: {
  value?: string;
  onChange: (value: string, sourceEl: HTMLButtonElement) => void;
  disabled?: boolean;
  getStatus?: (value: string) => SlotStatus;
  "aria-label"?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // A pre-selected value (e.g. the mobile tap-to-select flow's "now
  // rounded up" default, or a prefilled request-form value) can easily
  // land outside the initially-visible slice of this horizontally
  // scrolling row — reveal it instead of leaving the picker looking
  // empty until the user happens to scroll. `"instant"` avoids an
  // unnecessary animated scroll firing on every keystroke elsewhere on
  // the page that happens to re-render this component with same value.
  useEffect(() => {
    if (!value) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-value="${value}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
  }, [value]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={ariaLabel}
      className="flex gap-1.5 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1.5"
      style={{ scrollSnapType: "x proximity" }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        const status = getStatus?.(option.value);
        const meta = status ? STATUS_META[status] : null;
        const Icon = meta?.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            data-value={option.value}
            aria-selected={selected}
            aria-label={meta ? `${option.label} — ${meta.label}` : option.label}
            title={meta?.label}
            disabled={disabled}
            onClick={(e) => onChange(option.value, e.currentTarget)}
            style={{ scrollSnapAlign: "start" }}
            className={cn(
              "flex h-11 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] font-medium transition-all duration-200",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : cn(
                    "bg-card hover:bg-accent",
                    meta ? meta.className : "border-border text-foreground/80 hover:border-primary/40",
                  ),
            )}
          >
            {Icon && !selected ? <Icon className="size-2.5" aria-hidden="true" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Explains the picker's colors/icons in words — never rely on color alone. */
export function SlotStatusLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground", className)}>
      {(Object.keys(STATUS_META) as SlotStatus[]).map((status) => {
        const meta = STATUS_META[status];
        const Icon = meta.icon;
        return (
          <span key={status} className={cn("inline-flex items-center gap-1", meta.className)}>
            <Icon className="size-3" aria-hidden="true" />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

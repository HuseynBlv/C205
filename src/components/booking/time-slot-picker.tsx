"use client";

import { cn } from "@/lib/utils";
import { generateTimeOptions } from "@/lib/time-options";

const allOptions = generateTimeOptions(30);
// Room hours preview window — matches the calendar page's illustrated range.
const options = allOptions.filter((o) => o.value >= "07:00" && o.value <= "21:00");

/**
 * Time slots rendered as a horizontally scrollable row of small buttons
 * rather than a plain dropdown, so the full range stays scannable.
 */
export function TimeSlotPicker({
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  value?: string;
  onChange: (value: string, sourceEl: HTMLButtonElement) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className="flex gap-1.5 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1.5"
      style={{ scrollSnapType: "x proximity" }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            onClick={(e) => onChange(option.value, e.currentTarget)}
            style={{ scrollSnapAlign: "start" }}
            className={cn(
              "flex h-11 w-16 shrink-0 flex-col items-center justify-center rounded-md border text-[11px] font-medium transition-all duration-200",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground/80 hover:border-primary/40 hover:bg-accent",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

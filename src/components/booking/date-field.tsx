"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Reusable date picker for booking forms. Dates are handled as plain
 * `YYYY-MM-DD` strings — the eventual server action interprets them in
 * ROOM_TIMEZONE (Asia/Baku), never the browser's local zone.
 */
export function DateField({
  value,
  onChange,
  disabled,
  fromDate,
  placeholder = "Pick a date",
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  fromDate?: Date;
  placeholder?: string;
}) {
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4" />
          {selected
            ? selected.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) =>
            onChange(date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : undefined)
          }
          disabled={fromDate ? { before: fromDate } : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

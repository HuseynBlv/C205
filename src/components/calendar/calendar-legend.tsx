import { Ban, Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LEGEND_ITEMS: { label: string; icon: React.ElementType; className: string }[] = [
  { label: "Available", icon: Check, className: "text-[var(--status-available)]" },
  { label: "Pending", icon: Clock, className: "text-[var(--status-pending)]" },
  { label: "Reserved", icon: Ban, className: "text-[var(--status-approved)]" },
  { label: "Unavailable", icon: X, className: "text-muted-foreground/70" },
];

/** Explains the calendar's colors/icons in words — status is never
 * carried by color alone. Same icon language as the request form's
 * TimeSlotPicker so the two screens read as one visual system. */
export function CalendarLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground", className)}>
      {LEGEND_ITEMS.map(({ label, icon: Icon, className: itemClassName }) => (
        <span key={label} className={cn("inline-flex items-center gap-1.5", itemClassName)}>
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  );
}

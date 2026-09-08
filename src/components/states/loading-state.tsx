import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Resembles the actual week-grid structure (toolbar + a time-axis gutter
 * plus seven day columns) rather than a generic block list, so loading
 * reads as "the calendar is coming" instead of an unrelated placeholder. */
export function CalendarLoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading calendar…</span>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="rounded-xl border border-border p-2">
        <div className="grid grid-cols-[2.5rem_repeat(7,1fr)] gap-1">
          <div />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={`h${i}`} className="h-10 rounded-md" />
          ))}
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={`r${row}`} className="contents">
              <Skeleton className="h-12 rounded-md" />
              {Array.from({ length: 7 }).map((_, col) => (
                <Skeleton key={`${row}-${col}`} className="h-12 rounded-md" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

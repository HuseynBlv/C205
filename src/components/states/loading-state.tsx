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

export function CalendarLoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading calendar…</span>
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 28 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}

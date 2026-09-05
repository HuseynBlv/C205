const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = ["9a", "11a", "1p", "3p", "5p"];

/** Same three states as the hero capsule's grid — continuity across the transition. */
type SlotState = "available" | "pending" | "reserved";

const PATTERN: SlotState[] = [
  "available", "available", "pending", "available", "available",
  "available", "reserved", "available", "available", "pending",
  "pending", "available", "available", "reserved", "available",
  "available", "available", "available", "available", "reserved",
  "reserved", "available", "pending", "available", "available",
];

const STATE_CLASS: Record<SlotState, string> = {
  available: "bg-[color-mix(in_oklab,var(--primary)_6%,white)]",
  pending: "bg-[color-mix(in_oklab,var(--status-pending)_22%,white)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--status-pending)_50%,white)]",
  reserved: "bg-[color-mix(in_oklab,var(--status-approved)_20%,white)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--status-approved)_50%,white)]",
};

/**
 * A stand-in for the real availability calendar, used only as the landing
 * point of the hero → calendar transition. It shares color language with
 * `RoomCapsule` so the morph reads as one continuous idea.
 */
export function CalendarPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_60px_-25px_rgba(20,28,48,0.35)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <p className="text-sm font-medium text-foreground">C205 · this week</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--status-pending)]" /> Pending
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--status-approved)]" /> Reserved
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[40px_repeat(5,1fr)] gap-px bg-border p-px">
        <div className="bg-card" />
        {DAYS.map((d) => (
          <div key={d} className="bg-card py-2 text-center text-[11px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {HOURS.map((hour, row) => (
          <div key={hour} className="contents">
            <div className="flex items-start justify-end bg-card px-2 py-2 text-[10px] text-muted-foreground">
              {hour}
            </div>
            {DAYS.map((_, col) => {
              const state = PATTERN[row * DAYS.length + col] ?? "available";
              return (
                <div
                  key={col}
                  className={`h-9 bg-card p-1 sm:h-10 ${state !== "available" ? "" : ""}`}
                >
                  <div className={`size-full rounded-sm ${STATE_CLASS[state]}`} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

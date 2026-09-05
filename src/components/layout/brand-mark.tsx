import { cn } from "@/lib/utils";

/**
 * The recurring "C205 spatial outline" — a miniature doorway/portal with one
 * illuminated slot, echoing the hero room capsule at every size. `tone`
 * switches between the light app chrome and the dark hero/floating nav.
 */
function SpatialOutline({ tone }: { tone: "light" | "dark" }) {
  const stroke = tone === "dark" ? "rgba(244,242,236,0.75)" : "#2b4de0";
  const glow = tone === "dark" ? "#e8a659" : "#158f63";
  return (
    <svg viewBox="0 0 32 32" className="size-full" aria-hidden="true">
      <path
        d="M12 4 H20 A8 8 0 0 1 28 12 V24 A2 2 0 0 1 26 26 H6 A2 2 0 0 1 4 24 V12 A8 8 0 0 1 12 4 Z"
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
      />
      <rect x="13.5" y="14.5" width="5" height="5" rx="1" fill={glow} />
    </svg>
  );
}

export function BrandMark({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isDark ? "bg-white/10 ring-1 ring-white/15" : "bg-accent ring-1 ring-primary/10",
        )}
      >
        <SpatialOutline tone={tone} />
      </div>
      <div className="leading-tight">
        <p className={cn("text-sm font-semibold", isDark ? "text-[#f4f2ec]" : "text-foreground")}>
          C205
        </p>
        <p className={cn("text-[11px]", isDark ? "text-[#a7adc0]" : "text-muted-foreground")}>
          Room reservations
        </p>
      </div>
    </div>
  );
}

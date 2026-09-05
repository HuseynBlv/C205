/**
 * The "Make Space" signature object: an abstract, translucent room capsule —
 * a rounded architectural portal holding a glowing timetable. This is the
 * one visual spectacle in the product; it recurs (simplified) as the
 * BrandMark and (transformed) as the hero → calendar transition, so its
 * geometry lives here as the single source of truth.
 */

type SlotState = "available" | "pending" | "reserved";

/** Deterministic so server and client render identically (no hydration diff). */
const SLOT_PATTERN: SlotState[] = [
  "available", "available", "pending", "available", "available", "reserved",
  "available", "reserved", "available", "available", "pending", "available",
  "pending", "available", "available", "reserved", "available", "available",
  "available", "available", "reserved", "available", "pending", "available",
  "available", "available", "available", "pending", "available", "reserved",
  "available", "available", "reserved", "available", "available", "available",
];

const SLOT_FILL: Record<SlotState, string> = {
  available: "color-mix(in oklab, var(--hero-blue) 22%, transparent)",
  pending: "var(--hero-amber)",
  reserved: "var(--hero-emerald)",
};

const SLOT_GLOW: Record<SlotState, string> = {
  available: "none",
  pending: "drop-shadow(0 0 6px color-mix(in oklab, var(--hero-amber) 70%, transparent))",
  reserved: "drop-shadow(0 0 6px color-mix(in oklab, var(--hero-emerald) 70%, transparent))",
};

/** A doorway-like path: generous arched top corners, modest base corners. */
function doorPath(x: number, y: number, w: number, h: number, rt: number, rb: number) {
  return [
    `M ${x + rt} ${y}`,
    `H ${x + w - rt}`,
    `A ${rt} ${rt} 0 0 1 ${x + w} ${y + rt}`,
    `V ${y + h - rb}`,
    `A ${rb} ${rb} 0 0 1 ${x + w - rb} ${y + h}`,
    `H ${x + rb}`,
    `A ${rb} ${rb} 0 0 1 ${x} ${y + h - rb}`,
    `V ${y + rt}`,
    `A ${rt} ${rt} 0 0 1 ${x + rt} ${y}`,
    "Z",
  ].join(" ");
}

const COLS = 6;
const ROWS = 6;
const GRID_X = 118;
const GRID_Y = 132;
const GRID_W = 364;
const GRID_H = 372;
const GAP = 8;
const CELL_W = (GRID_W - GAP * (COLS - 1)) / COLS;
const CELL_H = (GRID_H - GAP * (ROWS - 1)) / ROWS;

export function RoomCapsule({
  className,
  id = "capsule",
}: {
  className?: string;
  /** Unique id prefix so multiple instances on one page don't collide. */
  id?: string;
}) {
  return (
    <div
      className={className}
      style={{ perspective: "1400px" }}
      aria-hidden="true"
    >
      <div className="capsule-tilt" style={{ transformStyle: "preserve-3d" }}>
        <svg
          viewBox="0 0 600 600"
          className="h-full w-full"
          role="img"
          aria-label="Illustration of C205 rendered as a glowing architectural room capsule holding a timetable of available, pending, and reserved hours"
        >
          <defs>
            <radialGradient id={`${id}-blue-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--hero-blue)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--hero-blue)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${id}-amber-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--hero-amber)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--hero-amber)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${id}-frame-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="45%" stopColor="var(--hero-blue)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
            </linearGradient>
            <linearGradient id={`${id}-glass`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Atmospheric lighting */}
          <circle cx="150" cy="140" r="260" fill={`url(#${id}-blue-glow)`} className="capsule-ambient" />
          <circle cx="460" cy="480" r="240" fill={`url(#${id}-amber-glow)`} className="capsule-ambient capsule-ambient-delay" />

          {/* Outer portal frame */}
          <path
            d={doorPath(70, 26, 460, 548, 190, 30)}
            fill={`url(#${id}-glass)`}
            stroke={`url(#${id}-frame-stroke)`}
            strokeWidth={1.5}
          />
          {/* Inner frame, slightly inset — reads as glass thickness */}
          <path
            d={doorPath(92, 48, 416, 504, 170, 22)}
            fill="none"
            stroke="var(--hero-border)"
            strokeWidth={1}
          />

          {/* A faint door seam + knob to ground the room/door metaphor */}
          <line x1="300" y1="360" x2="300" y2="540" stroke="var(--hero-border)" strokeWidth={1} />
          <circle cx="292" cy="452" r="3" fill="var(--hero-border)" />

          {/* Glowing timetable grid */}
          <g>
            {SLOT_PATTERN.map((state, i) => {
              const col = i % COLS;
              const row = Math.floor(i / COLS);
              const x = GRID_X + col * (CELL_W + GAP);
              const y = GRID_Y + row * (CELL_H + GAP);
              const delay = (i % COLS) * 90 + row * 60;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={CELL_W}
                  height={CELL_H}
                  rx={3}
                  fill={SLOT_FILL[state]}
                  stroke={state === "available" ? "var(--hero-border)" : "transparent"}
                  strokeWidth={1}
                  style={{
                    filter: SLOT_GLOW[state],
                    animationDelay: `${delay}ms`,
                  }}
                  className={state !== "available" ? "capsule-slot-lit" : "capsule-slot-idle"}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

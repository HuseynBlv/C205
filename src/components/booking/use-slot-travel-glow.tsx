"use client";

import { useCallback, useRef, useState } from "react";

interface TravelState {
  key: number;
  from: { x: number; y: number; w: number; h: number };
  to: { x: number; y: number };
  phase: "start" | "moving";
}

/**
 * When a time slot is selected, its blue illumination visibly travels
 * toward the reservation summary so the relationship reads at a glance.
 * No-ops entirely under prefers-reduced-motion.
 */
export function useSlotTravelGlow() {
  const [travel, setTravel] = useState<TravelState | null>(null);
  const keyRef = useRef(0);

  const fire = useCallback((fromEl: HTMLElement, toEl: HTMLElement | null) => {
    if (!toEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const key = ++keyRef.current;

    setTravel({
      key,
      from: {
        x: fromRect.left + fromRect.width / 2,
        y: fromRect.top + fromRect.height / 2,
        w: fromRect.width * 0.6,
        h: fromRect.height * 0.6,
      },
      to: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
      phase: "start",
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTravel((t) => (t && t.key === key ? { ...t, phase: "moving" } : t));
      });
    });

    window.setTimeout(() => {
      setTravel((t) => (t && t.key === key ? null : t));
    }, 480);
  }, []);

  const node = travel ? (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[60] rounded-full bg-primary transition-all duration-[420ms] ease-out"
      style={{
        left: 0,
        top: 0,
        width: travel.phase === "start" ? travel.from.w : 8,
        height: travel.phase === "start" ? travel.from.h : 8,
        transform: `translate(${
          (travel.phase === "start" ? travel.from.x : travel.to.x) -
          (travel.phase === "start" ? travel.from.w / 2 : 4)
        }px, ${
          (travel.phase === "start" ? travel.from.y : travel.to.y) -
          (travel.phase === "start" ? travel.from.h / 2 : 4)
        }px)`,
        opacity: travel.phase === "start" ? 0.85 : 0,
        boxShadow: "0 0 22px 4px var(--primary)",
      }}
    />
  ) : null;

  return { fire, node };
}

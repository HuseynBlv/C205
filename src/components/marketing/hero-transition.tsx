"use client";

import { useEffect, useRef } from "react";
import { RoomCapsule } from "@/components/marketing/room-capsule";
import { CalendarPreview } from "@/components/marketing/calendar-preview";

/**
 * The signature moment: as the visitor scrolls past the hero, the room
 * capsule simplifies and fades while the real calendar grid takes its place
 * — coordinated scale, opacity, and shared color rather than a literal
 * object morph. Fully static (no scroll-jacking, no dark overlay) when
 * `prefers-reduced-motion` is set.
 */
export function HeroToCalendarTransition() {
  const sectionRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const section = sectionRef.current;
        const capsule = capsuleRef.current;
        const calendar = calendarRef.current;
        const scene = sceneRef.current;
        if (!section || !capsule || !calendar || !scene) return;

        const rect = section.getBoundingClientRect();
        const total = rect.height - window.innerHeight;
        const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;

        scene.style.opacity = String(1 - p);

        const capsuleP = Math.min(1, p / 0.6);
        capsule.style.opacity = String(1 - capsuleP);
        capsule.style.transform = `scale(${1 - capsuleP * 0.4}) translateY(${capsuleP * -30}px)`;

        const calendarP = Math.max(0, (p - 0.35) / 0.65);
        calendar.style.opacity = String(calendarP);
        calendar.style.transform = `scale(${0.94 + calendarP * 0.06}) translateY(${(1 - calendarP) * 24}px)`;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative h-[220vh] motion-reduce:h-auto motion-reduce:bg-background"
    >
      <div className="hero-scene-vars sticky top-0 flex h-dvh flex-col items-center justify-center overflow-hidden motion-reduce:static motion-reduce:h-auto motion-reduce:gap-14 motion-reduce:overflow-visible motion-reduce:py-24">
        <div className="absolute inset-0 bg-background motion-reduce:hidden" />
        <div ref={sceneRef} className="hero-scene absolute inset-0 motion-reduce:hidden" />

        <div
          ref={capsuleRef}
          className="relative z-10 w-[260px] sm:w-[340px] motion-reduce:static motion-reduce:opacity-100 motion-reduce:[transform:none]"
        >
          <RoomCapsule className="aspect-square" />
          <p className="mt-4 text-center text-xs uppercase tracking-[0.2em] text-[#a7adc0] motion-reduce:text-muted-foreground">
            Real availability, live inside
          </p>
        </div>

        <div
          ref={calendarRef}
          className="absolute z-10 w-[min(92vw,640px)] opacity-0 motion-reduce:static motion-reduce:opacity-100 motion-reduce:[transform:none]"
        >
          <CalendarPreview />
        </div>
      </div>
    </section>
  );
}

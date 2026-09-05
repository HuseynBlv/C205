import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomCapsule } from "@/components/marketing/room-capsule";
import { HeroToCalendarTransition } from "@/components/marketing/hero-transition";
import { ROOM_NAME, ORG_NAME } from "@/lib/config";

const workflowSteps = [
  {
    title: "Submit a request",
    description:
      "Pick a date, start and end time, purpose, and participant count. Submitting never confirms a booking.",
  },
  {
    title: "USG reviews it",
    description:
      "Your request sits as Pending. It can overlap with other pending requests — nothing is reserved yet.",
  },
  {
    title: "Approved or rejected",
    description:
      "An administrator makes a decision, with a reason recorded if rejected. Approved reservations never overlap.",
  },
  {
    title: "You're notified",
    description:
      "An automatic email confirms the outcome the moment a decision — or any later change — is made.",
  },
];

const features = [
  {
    icon: CalendarClock,
    title: "Real availability, always current",
    description:
      "See published open hours and blocked dates for C205 before you request a time.",
  },
  {
    icon: ShieldCheck,
    title: "Authorized access only",
    description:
      "An administrator approves every account before it can request the room — verification alone isn't enough.",
  },
  {
    icon: Users,
    title: "Built for USG operations",
    description:
      "Advance-notice rules, override reasons, and full decision history keep the process accountable.",
  },
  {
    icon: Mail,
    title: "Every decision emailed",
    description:
      "Requesters hear about submission, approval, rejection, and any later change — automatically.",
  },
];

export default function MarketingHomePage() {
  return (
    <div>
      {/* Hero — the one cinematic moment in the product. */}
      <section className="hero-scene hero-scene-vars bg-grain relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-4 pt-24 pb-16 md:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 18% 12%, color-mix(in oklab, var(--hero-blue) 22%, transparent), transparent), radial-gradient(55% 45% at 85% 88%, color-mix(in oklab, var(--hero-amber) 16%, transparent), transparent)",
          }}
        />
        <div
          aria-hidden="true"
          className="bg-architectural-grid pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ "--grid-line": "white" } as React.CSSProperties}
        />

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center text-center">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-[#dcdfe8]">
            {ORG_NAME}
          </span>

          <h1 className="font-serif-display mt-6 max-w-3xl text-4xl leading-[1.08] font-medium text-balance text-[#f4f2ec] sm:text-6xl md:text-7xl">
            Make space for what matters.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#c3c7d4] md:text-lg">
            View {ROOM_NAME} availability, submit your request, and follow its
            approval status — all in one place.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              asChild
              className="rounded-full bg-[var(--hero-blue)] px-6 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_40px_-16px_var(--hero-blue)] hover:bg-[var(--hero-blue)]/90"
            >
              <Link href="/requests/new">
                Request {ROOM_NAME}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="rounded-full border-white/20 bg-transparent px-6 text-[#f4f2ec] hover:bg-white/10"
            >
              <Link href="/calendar">View availability</Link>
            </Button>
          </div>

          <div className="mt-14 w-full max-w-md sm:mt-16 sm:max-w-lg">
            <RoomCapsule className="mx-auto aspect-square w-full" />
          </div>
        </div>
      </section>

      {/* Signature transition: the capsule simplifies into the real calendar. */}
      <HeroToCalendarTransition />

      <div className="mx-auto w-full max-w-5xl px-4 pb-24 md:px-6">
        <section className="border-t border-border py-14 md:py-20">
          <h2 className="text-xl font-semibold text-foreground md:text-2xl">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {workflowSteps.map((step, i) => (
              <div
                key={step.title}
                className="door-frame relative border border-border bg-card p-5"
              >
                <span className="text-xs font-semibold text-primary">Step {i + 1}</span>
                <p className="mt-2 text-sm font-medium text-foreground">{step.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-14 md:py-20">
          <h2 className="text-xl font-semibold text-foreground md:text-2xl">Built for how USG operates</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <Icon className="size-5 text-accent-foreground" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

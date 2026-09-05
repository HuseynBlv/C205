import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CalendarClock,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
      {/* Hero: ADA University campus photo under a navy overlay, matching
          usg.az's own hero treatment (same photo, supplied by the user). */}
      <section className="relative isolate overflow-hidden px-4 py-20 md:px-8 md:py-28">
        <Image
          src="/hero-campus.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-[#172e35]/85" />

        <div className="mx-auto flex w-full max-w-5xl flex-col items-start text-left">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-[#dbe4e6]">
            {ORG_NAME}
          </span>

          <h1 className="mt-6 max-w-2xl text-4xl leading-[1.1] font-bold text-balance text-white sm:text-5xl md:text-6xl">
            Reserve C205, without the back-and-forth.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#c7d2d5] md:text-lg">
            View {ROOM_NAME} availability, submit your request, and follow its
            approval status — all in one place.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/requests/new">
                Request {ROOM_NAME}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-white/25 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="/calendar">View availability</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-4 pb-24 md:px-6">
        <section className="py-14 md:py-20">
          <h2 className="text-xl font-bold text-foreground md:text-2xl">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {workflowSteps.map((step, i) => (
              <div
                key={step.title}
                className="rounded-lg border border-border bg-card p-5"
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
          <h2 className="text-xl font-bold text-foreground md:text-2xl">Built for how USG operates</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-4 rounded-lg border border-border bg-card p-5"
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

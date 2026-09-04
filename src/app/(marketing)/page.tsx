import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { ROOM_NAME } from "@/lib/config";

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
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 md:px-6">
      <section className="grid gap-10 py-14 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            University Student Government
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground md:text-5xl md:leading-[1.1]">
            Request {ROOM_NAME}.
            <br />
            <span className="text-primary">Reviewed before it&apos;s reserved.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            {ROOM_NAME} is the USG meeting room. Every request is reviewed by
            an administrator before it becomes a reservation — submitting a
            request only puts it in line for a decision.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/requests/new">
                Request {ROOM_NAME}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/calendar">View availability</Link>
            </Button>
          </div>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Example request
            </p>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Debate club practice round
                </p>
                <p className="text-sm text-muted-foreground">
                  Fri, Sep 12 · 11:00–12:30 · 10 participants
                </p>
              </div>
              <ReservationStatusBadge status="PENDING" />
            </div>
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Submitting locks in nothing — USG still needs to review this
              request before {ROOM_NAME} is reserved.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="border-t border-border py-14 md:py-20">
        <h2 className="text-xl font-semibold text-foreground md:text-2xl">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {workflowSteps.map((step, i) => (
            <div key={step.title} className="relative rounded-xl border border-border bg-card p-5">
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
            <div key={title} className="flex gap-4 rounded-xl border border-border bg-card p-5">
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
  );
}

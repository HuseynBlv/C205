"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, Clock, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DateField } from "@/components/booking/date-field";
import { TimeSlotPicker, SlotStatusLegend } from "@/components/booking/time-slot-picker";
import { useSlotTravelGlow } from "@/components/booking/use-slot-travel-glow";
import { useRefreshOnFocus } from "@/lib/hooks/use-refresh-on-focus";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { fixtureAvailability } from "@/lib/fixtures/data";
import { ROOM_NAME, ROOM_TIMEZONE, useFixtures } from "@/lib/config";
import { cn } from "@/lib/utils";
import { submitRequestAction } from "@/lib/booking/actions";
import { getDayAvailabilityAction } from "@/lib/booking/availability-query";
import { mapBookingError } from "@/lib/booking/errors";
import {
  EMPTY_DAY_AVAILABILITY,
  evaluateRequestedRange,
  getSlotStatus,
  type DayAvailability,
} from "@/lib/booking/slot-status";
import { roomLocalToUtcIso } from "@/lib/booking/timezone";

const requestSchema = z
  .object({
    date: z.string().min(1, "Pick a date."),
    startTime: z.string().min(1, "Pick a start time."),
    endTime: z.string().min(1, "Pick an end time."),
    purpose: z.string().min(3, "Describe the purpose of the meeting."),
    participantCount: z.number().int().min(1, "Enter at least 1 participant."),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  });

type RequestValues = z.infer<typeof requestSchema>;

const today = new Date();
today.setHours(0, 0, 0, 0);

function formatDateLabel(value?: string) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Fixture stand-in for getDayAvailabilityAction — derived from the same
 * static fixtures the rest of the preview uses, so the picker still shows
 * something plausible without touching the real backend. */
function fixtureDayAvailability(date: string): DayAvailability {
  const window = fixtureAvailability.find((w) => w.date === date);
  if (!window) return EMPTY_DAY_AVAILABILITY;
  const startMin = timeToMinutes(window.startTime);
  const endMin = timeToMinutes(window.endTime);
  return window.isBlocked
    ? { ...EMPTY_DAY_AVAILABILITY, windows: [{ startMin: 0, endMin: 24 * 60 }], blocks: [{ startMin, endMin }] }
    : { ...EMPTY_DAY_AVAILABILITY, windows: [{ startMin, endMin }] };
}

const CLIENT_VALIDATION_COPY: Record<string, { tone: "destructive" | "info"; text: string }> = {
  OUTSIDE_AVAILABILITY: { tone: "destructive", text: mapBookingError("OUTSIDE_AVAILABILITY") },
  RESERVATION_CONFLICT: { tone: "destructive", text: mapBookingError("RESERVATION_CONFLICT") },
  ADVANCE_NOTICE_REQUIRED: { tone: "destructive", text: mapBookingError("ADVANCE_NOTICE_REQUIRED") },
};

export interface RequestFormInitialSelection {
  date?: string;
  startTime?: string;
  endTime?: string;
}

export function RequestForm({
  roomId,
  initialSelection,
}: {
  roomId: string | null;
  /** Prefills the form from a time the user already selected on the
   * calendar (see calendar/page.tsx's `?date=&start=&end=`) — advisory
   * only. Nothing here is trusted: the day-availability fetch below and
   * the real submit_request call both re-check this exact interval
   * against live data regardless of how the fields got filled in. */
  initialSelection?: RequestFormInitialSelection;
}) {
  const [submitted, setSubmitted] = useState<RequestValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshedAfterError, setRefreshedAfterError] = useState(false);
  const summaryTimeRef = useRef<HTMLDivElement>(null);

  // Tracks {payload, key} for the last submission attempt, so a retry of
  // the *same* payload (e.g. after a dropped network response) reuses the
  // same idempotency key — but any edit to the form (a genuinely different
  // attempt) gets a fresh one on the next submit. Read/written only inside
  // the submit handler, never during render, so this is plain state rather
  // than a ref.
  const [lastAttempt, setLastAttempt] = useState<{ payload: string; key: string } | null>(null);

  const { fire, node: travelGlow } = useSlotTravelGlow();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      purpose: "",
      participantCount: 1,
      date: initialSelection?.date,
      startTime: initialSelection?.startTime,
      endTime: initialSelection?.endTime,
    },
  });

  const values = useWatch({ control });

  const [day, setDay] = useState<DayAvailability>(EMPTY_DAY_AVAILABILITY);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);

  const loadDay = useCallback(
    async (date: string) => {
      if (!date) return;
      setDayLoading(true);
      setDayError(null);

      if (useFixtures) {
        await new Promise((r) => setTimeout(r, 300));
        setDay(fixtureDayAvailability(date));
        setDayLoading(false);
        return;
      }

      if (!roomId) {
        setDayLoading(false);
        return;
      }

      const result = await getDayAvailabilityAction({ roomId, date });
      if (!result.ok) {
        setDayError(result.error);
        setDay(EMPTY_DAY_AVAILABILITY);
      } else {
        setDay(result.data);
      }
      setDayLoading(false);
    },
    [roomId],
  );

  useEffect(() => {
    // Deferred to a microtask so the state updates loadDay performs happen
    // in a callback rather than synchronously within the effect body.
    if (!values.date) return;
    const date = values.date;
    void Promise.resolve().then(() => loadDay(date));
  }, [values.date, loadDay]);

  // Keep the picker current while the form is open: another user's
  // submission or an admin decision can change what's actually available
  // without this page ever reloading. Simple polling, not realtime infra.
  useRefreshOnFocus(() => {
    if (values.date) void loadDay(values.date);
  }, 45_000);

  // Render must stay pure, so "now" lives in state (refreshed on mount and
  // alongside the picker's own periodic refresh) rather than calling
  // Date.now() directly while computing the live validation preview below.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() => setNowMs(Date.now()));
    const id = setInterval(() => setNowMs(Date.now()), 45_000);
    return () => clearInterval(id);
  }, []);

  const startMin = values.startTime ? timeToMinutes(values.startTime) : null;
  const endMin = values.endTime ? timeToMinutes(values.endTime) : null;

  let livePreview: { tone: "destructive" | "info"; text: string } | null = null;
  if (values.date && startMin !== null && endMin !== null && endMin > startMin && !dayLoading && nowMs !== null) {
    const startsAtMs = new Date(roomLocalToUtcIso(values.date, values.startTime!)).getTime();
    const endsAtMs = new Date(roomLocalToUtcIso(values.date, values.endTime!)).getTime();
    const evaluation = evaluateRequestedRange(day, startMin, endMin, {
      startsAtMs,
      endsAtMs,
      nowMs,
    });
    if (evaluation.code) {
      livePreview = CLIENT_VALIDATION_COPY[evaluation.code];
    } else if (evaluation.overlapsPending) {
      livePreview = {
        tone: "info",
        text: "This overlaps another pending request. You can still submit — USG decides in submission order, and only one of you will end up approved.",
      };
    }
  }

  const onSubmit = handleSubmit(async (formValues) => {
    setFormError(null);
    setRefreshedAfterError(false);

    if (useFixtures) {
      await new Promise((r) => setTimeout(r, 500));
      setSubmitted(formValues);
      return;
    }

    if (!roomId) {
      setFormError("C205 isn't configured yet. Contact an administrator.");
      return;
    }

    const startsAt = roomLocalToUtcIso(formValues.date, formValues.startTime);
    const endsAt = roomLocalToUtcIso(formValues.date, formValues.endTime);
    const payload = JSON.stringify({
      roomId,
      startsAt,
      endsAt,
      purpose: formValues.purpose,
      participantCount: formValues.participantCount,
    });
    const canReuseKey = lastAttempt?.payload === payload;
    const idempotencyKey = canReuseKey
      ? lastAttempt!.key
      : typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : undefined;
    if (idempotencyKey) setLastAttempt({ payload, key: idempotencyKey });

    const result = await submitRequestAction({
      roomId,
      startsAt,
      endsAt,
      purpose: formValues.purpose,
      participantCount: formValues.participantCount,
      idempotencyKey,
    });

    if (!result.ok) {
      setFormError(result.error);
      // The rejection likely means the picture we showed the user is
      // stale (someone else just booked or an admin just changed
      // availability) — refresh it now rather than making them guess.
      void loadDay(formValues.date).then(() => setRefreshedAfterError(true));
      return;
    }
    setSubmitted(formValues);
  });

  if (submitted) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-full",
              "bg-[color-mix(in_oklab,var(--status-pending)_16%,white)]",
              "animate-in zoom-in-75 fade-in duration-500",
            )}
          >
            <Clock className="size-6 text-[var(--status-pending)]" />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
            <p className="text-base font-medium text-foreground">
              Request captured as{" "}
              <span className="text-[var(--status-pending)]">Pending</span>
            </p>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              {formatDateLabel(submitted.date)} · {formatTimeLabel(submitted.startTime)}–
              {formatTimeLabel(submitted.endTime)}
            </p>
          </div>
          <p className="max-w-sm text-sm font-medium text-foreground">
            Pending USG approval. The room is not yet reserved.
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {useFixtures
              ? "This is a fixture preview — no request was actually created. In the finished system USG would be notified and you'd get an email as soon as a decision is made."
              : "USG has been notified and you'll receive an email as soon as a decision is made."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSubmitted(null);
              reset();
            }}
          >
            {useFixtures ? "Start another preview" : "Submit another request"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {travelGlow}
      {useFixtures ? (
        <PreviewNotice>
          This is a fixture preview — submitting doesn&apos;t create a real
          request. Set NEXT_PUBLIC_USE_FIXTURES=false to submit for real.
        </PreviewNotice>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Request {ROOM_NAME}</CardTitle>
          <CardDescription>
            Submitting puts your request in line for USG review — it does
            not confirm a booking. Times are interpreted in {ROOM_TIMEZONE},
            regardless of your device&apos;s timezone.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DateField value={field.value} onChange={field.onChange} fromDate={today} />
                )}
              />
              {errors.date ? <p className="text-xs text-destructive">{errors.date.message}</p> : null}
            </div>

            {values.date ? (
              <div className="space-y-1.5">
                {dayLoading ? (
                  <Skeleton className="h-11 w-full rounded-lg" />
                ) : dayError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Couldn&apos;t load availability</AlertTitle>
                    <AlertDescription className="flex items-center justify-between gap-2">
                      <span>{dayError}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void loadDay(values.date!)}
                      >
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <SlotStatusLegend />
                )}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Start time</Label>
              <Controller
                control={control}
                name="startTime"
                render={({ field }) => (
                  <TimeSlotPicker
                    aria-label="Start time"
                    value={field.value}
                    disabled={!values.date}
                    getStatus={
                      values.date ? (v) => getSlotStatus(day, timeToMinutes(v), timeToMinutes(v) + 30) : undefined
                    }
                    onChange={(v, el) => {
                      field.onChange(v);
                      fire(el, summaryTimeRef.current);
                    }}
                  />
                )}
              />
              {errors.startTime ? (
                <p className="text-xs text-destructive">{errors.startTime.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>End time</Label>
              <Controller
                control={control}
                name="endTime"
                render={({ field }) => (
                  <TimeSlotPicker
                    aria-label="End time"
                    value={field.value}
                    disabled={!values.date}
                    getStatus={
                      values.date ? (v) => getSlotStatus(day, timeToMinutes(v) - 30, timeToMinutes(v)) : undefined
                    }
                    onChange={(v, el) => {
                      field.onChange(v);
                      fire(el, summaryTimeRef.current);
                    }}
                  />
                )}
              />
              {errors.endTime ? (
                <p className="text-xs text-destructive">{errors.endTime.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea
                id="purpose"
                rows={3}
                placeholder="What is this meeting for?"
                aria-invalid={Boolean(errors.purpose)}
                {...register("purpose")}
              />
              {errors.purpose ? (
                <p className="text-xs text-destructive">{errors.purpose.message}</p>
              ) : null}
            </div>

            <div className="max-w-40 space-y-1.5">
              <Label htmlFor="participantCount">Participants</Label>
              <Input
                id="participantCount"
                type="number"
                min={1}
                aria-invalid={Boolean(errors.participantCount)}
                {...register("participantCount", { valueAsNumber: true })}
              />
              {errors.participantCount ? (
                <p className="text-xs text-destructive">{errors.participantCount.message}</p>
              ) : null}
            </div>

            {Object.keys(errors).length > 0 ? (
              <Alert variant="destructive">
                <AlertTitle>Check the fields above</AlertTitle>
                <AlertDescription>
                  A few fields need your attention before this can be submitted.
                </AlertDescription>
              </Alert>
            ) : null}

            {livePreview ? (
              <Alert variant={livePreview.tone === "destructive" ? "destructive" : "default"}>
                {livePreview.tone === "destructive" ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Info className="size-4" />
                )}
                <AlertTitle>
                  {livePreview.tone === "destructive" ? "This time may not work" : "Heads up"}
                </AlertTitle>
                <AlertDescription>{livePreview.text}</AlertDescription>
              </Alert>
            ) : null}

            {formError ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t submit this request</AlertTitle>
                <AlertDescription>
                  {formError}{" "}
                  {refreshedAfterError
                    ? "Availability below has been refreshed — your other details were kept, so just pick a new time and submit again."
                    : "Your other details were kept — adjust the time and try again."}
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Reservation summary — the slot's illumination travels here. */}
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Reservation summary
              </p>
              <div ref={summaryTimeRef} className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Clock className="size-4 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatDateLabel(values.date) ?? "Pick a date"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {values.startTime && values.endTime
                      ? `${formatTimeLabel(values.startTime)} – ${formatTimeLabel(values.endTime)}`
                      : "Pick a start and end time"}
                    {values.participantCount ? ` · ${values.participantCount} participants` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                Submitting puts this in line for review — {ROOM_NAME} is not
                reserved until USG approves it.
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "Submitting…" : "Submit request"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Clock, ShieldCheck } from "lucide-react";
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
import { DateField } from "@/components/booking/date-field";
import { TimeSlotPicker } from "@/components/booking/time-slot-picker";
import { useSlotTravelGlow } from "@/components/booking/use-slot-travel-glow";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import { cn } from "@/lib/utils";

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

export function RequestForm() {
  const [submitted, setSubmitted] = useState<RequestValues | null>(null);
  const summaryTimeRef = useRef<HTMLDivElement>(null);
  const { fire, node: travelGlow } = useSlotTravelGlow();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { purpose: "", participantCount: 1 },
  });

  const values = useWatch({ control });

  const onSubmit = handleSubmit(async (formValues) => {
    // No backend yet: the booking engine step wires this to a server action
    // that enforces availability, the 72-hour rule, and overlap checks.
    await new Promise((r) => setTimeout(r, 500));
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
          <p className="max-w-sm text-sm text-muted-foreground">
            In the finished system this would submit for USG review, notify
            USG, and email you confirming your request is Pending. No request
            was actually created — this build has no backend yet.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSubmitted(null);
              reset();
            }}
          >
            Start another preview
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {travelGlow}
      <PreviewNotice>
        Submission is not connected to a backend yet — the booking engine
        step adds the 72-hour advance-notice rule, availability checks, and
        real persistence.
      </PreviewNotice>
      <Card>
        <CardHeader>
          <CardTitle>Request {ROOM_NAME}</CardTitle>
          <CardDescription>
            Submitting puts your request in line for USG review — it does
            not confirm a booking. Times are interpreted in {ROOM_TIMEZONE}.
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

            <div className="space-y-1.5">
              <Label>Start time</Label>
              <Controller
                control={control}
                name="startTime"
                render={({ field }) => (
                  <TimeSlotPicker
                    aria-label="Start time"
                    value={field.value}
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

            {/* Reservation summary — the slot's illumination travels here. */}
            <div className="door-frame border border-border bg-muted/40 p-4">
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

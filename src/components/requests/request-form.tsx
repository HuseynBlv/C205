"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
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
import { TimeSelect } from "@/components/booking/time-select";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";

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

export function RequestForm() {
  const [submitted, setSubmitted] = useState<RequestValues | null>(null);
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

  const onSubmit = handleSubmit(async (values) => {
    // No backend yet: the booking engine step wires this to a server action
    // that enforces availability, the 72-hour rule, and overlap checks.
    await new Promise((r) => setTimeout(r, 500));
    setSubmitted(values);
  });

  if (submitted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="size-6 text-emerald-600" />
          </div>
          <p className="text-base font-medium text-foreground">Preview: request captured as Pending</p>
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
          <CardContent className="space-y-4">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Controller
                  control={control}
                  name="startTime"
                  render={({ field }) => (
                    <TimeSelect value={field.value} onChange={field.onChange} placeholder="Start" />
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
                    <TimeSelect value={field.value} onChange={field.onChange} placeholder="End" />
                  )}
                />
                {errors.endTime ? (
                  <p className="text-xs text-destructive">{errors.endTime.message}</p>
                ) : null}
              </div>
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

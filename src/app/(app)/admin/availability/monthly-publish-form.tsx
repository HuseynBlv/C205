"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { publishAvailabilityMonthAction } from "@/lib/booking/availability-actions";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

function isoWeekday(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function MonthlyPublishForm({ roomId }: { roomId: string }) {
  const [month, setMonth] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [newExcluded, setNewExcluded] = useState("");
  const [label, setLabel] = useState("Weekday hours");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewDates = useMemo(() => {
    if (!month) return [];
    const [y, m] = month.split("-").map(Number);
    const dates: string[] = [];
    const cursor = new Date(Date.UTC(y, m - 1, 1));
    while (cursor.getUTCMonth() === m - 1) {
      const iso = cursor.toISOString().slice(0, 10);
      if (weekdays.includes(isoWeekday(cursor)) && !excludedDates.includes(iso)) {
        dates.push(iso);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }, [month, weekdays, excludedDates]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Publish a month of availability</CardTitle>
        <CardDescription>
          Open the same weekday hours across an entire month, minus any dates you exclude.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="month-publish-month">Month</Label>
            <Input id="month-publish-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="month-publish-start">Start time</Label>
            <Input id="month-publish-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="month-publish-end">End time</Label>
            <Input id="month-publish-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Weekdays</Label>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((wd) => (
              <label key={wd.value} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={weekdays.includes(wd.value)}
                  onCheckedChange={(checked) =>
                    setWeekdays((prev) => (checked ? [...prev, wd.value] : prev.filter((v) => v !== wd.value)))
                  }
                />
                {wd.label}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="month-publish-label">Label (optional)</Label>
          <Input id="month-publish-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="month-publish-exclude">Excluded dates</Label>
          <div className="flex gap-2">
            <Input
              id="month-publish-exclude"
              type="date"
              value={newExcluded}
              onChange={(e) => setNewExcluded(e.target.value)}
              className="max-w-48"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!newExcluded || excludedDates.includes(newExcluded)}
              onClick={() => {
                setExcludedDates((prev) => [...prev, newExcluded].sort());
                setNewExcluded("");
              }}
            >
              Add
            </Button>
          </div>
          {excludedDates.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {excludedDates.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1">
                  {formatDate(d)}
                  <button
                    type="button"
                    aria-label={`Remove excluded date ${d}`}
                    onClick={() => setExcludedDates((prev) => prev.filter((x) => x !== d))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        {month ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-foreground">
              {previewDates.length === 0
                ? "No matching dates this month."
                : `Will publish ${startTime}–${endTime} on ${previewDates.length} date${previewDates.length === 1 ? "" : "s"}:`}
            </p>
            {previewDates.length > 0 ? (
              <p className="mt-1 max-h-24 overflow-y-auto text-xs text-muted-foreground">
                {previewDates.map(formatDate).join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {success !== null ? (
          <Alert>
            <AlertDescription>Published {success} availability window{success === 1 ? "" : "s"}.</AlertDescription>
          </Alert>
        ) : null}

        <Button
          size="sm"
          disabled={isPending || previewDates.length === 0}
          onClick={() => {
            setError(null);
            setSuccess(null);
            startTransition(async () => {
              const result = await publishAvailabilityMonthAction({
                roomId,
                month: `${month}-01`,
                weekdays,
                startTime,
                endTime,
                excludedDates,
                label: label || undefined,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSuccess(result.count ?? previewDates.length);
              setExcludedDates([]);
            });
          }}
        >
          {isPending ? "Publishing…" : "Publish month"}
        </Button>
      </CardContent>
    </Card>
  );
}

"use server";

import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { roomLocalToUtcIso } from "@/lib/booking/timezone";
import { ROOM_TIMEZONE } from "@/lib/config";
import type { DayAvailability, MinuteRange } from "@/lib/booking/slot-status";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Minutes-since-midnight of `iso` on the room's local calendar `date`,
 * clamped to [0, 1440] for rows that start before or end after that day. */
function toClampedMinutes(iso: string, date: string): number {
  const wall = formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  const [wallDate, wallTime] = wall.split("T");
  if (wallDate < date) return 0;
  if (wallDate > date) return 24 * 60;
  const [h, m] = wallTime.split(":").map(Number);
  return h * 60 + m;
}

function toRange(row: { starts_at: string; ends_at: string }, date: string): MinuteRange {
  return { startMin: toClampedMinutes(row.starts_at, date), endMin: toClampedMinutes(row.ends_at, date) };
}

type Result = { ok: true; data: DayAvailability } | { ok: false; error: string };

/** Everything the booking form needs to color-code a single local calendar
 * day: published availability, admin blocks, and other users' anonymized
 * pending/approved occupancy (via the `room_occupancy` view — never the
 * base `reservations` table, so no requester identity is ever fetched
 * client-side for this purpose). */
export async function getDayAvailabilityAction(input: {
  roomId: string;
  date: string;
}): Promise<Result> {
  const dayStartUtc = roomLocalToUtcIso(input.date, "00:00");
  const dayEndUtc = roomLocalToUtcIso(addDays(input.date, 1), "00:00");

  const supabase = await createClient();
  const [windowsRes, blocksRes, occupancyRes] = await Promise.all([
    supabase
      .from("availability_windows")
      .select("starts_at,ends_at")
      .eq("room_id", input.roomId)
      .lt("starts_at", dayEndUtc)
      .gt("ends_at", dayStartUtc),
    supabase
      .from("blocked_intervals")
      .select("starts_at,ends_at")
      .eq("room_id", input.roomId)
      .lt("starts_at", dayEndUtc)
      .gt("ends_at", dayStartUtc),
    supabase
      .from("room_occupancy")
      .select("starts_at,ends_at,status")
      .eq("room_id", input.roomId)
      .lt("starts_at", dayEndUtc)
      .gt("ends_at", dayStartUtc),
  ]);

  const firstError = windowsRes.error ?? blocksRes.error ?? occupancyRes.error;
  if (firstError) {
    return { ok: false, error: "Couldn't load availability for that day. Please try again." };
  }

  const occupancy = occupancyRes.data ?? [];

  return {
    ok: true,
    data: {
      windows: (windowsRes.data ?? []).map((r) => toRange(r, input.date)),
      blocks: (blocksRes.data ?? []).map((r) => toRange(r, input.date)),
      pending: occupancy
        .filter((r) => r.status === "PENDING" && r.starts_at && r.ends_at)
        .map((r) => toRange(r as { starts_at: string; ends_at: string }, input.date)),
      approved: occupancy
        .filter((r) => r.status === "APPROVED" && r.starts_at && r.ends_at)
        .map((r) => toRange(r as { starts_at: string; ends_at: string }, input.date)),
    },
  };
}

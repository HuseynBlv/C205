"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mapBookingError } from "@/lib/booking/errors";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function publishAvailabilityWindowAction(input: {
  roomId: string;
  startsAt: string;
  endsAt: string;
  label?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_availability_window", {
    p_room_id: input.roomId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_label: input.label,
  });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function removeAvailabilityWindowAction(windowId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_availability_window", { p_window_id: windowId });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function createBlockedIntervalAction(input: {
  roomId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_blocked_interval", {
    p_room_id: input.roomId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function removeBlockedIntervalAction(blockId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_blocked_interval", { p_block_id: blockId });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function updateAvailabilityWindowAction(input: {
  windowId: string;
  startsAt: string;
  endsAt: string;
  label?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_availability_window", {
    p_window_id: input.windowId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_label: input.label,
  });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function updateBlockedIntervalAction(input: {
  blockId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_blocked_interval", {
    p_block_id: input.blockId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function publishAvailabilityMonthAction(input: {
  roomId: string;
  /** Any date within the target month, e.g. "2026-11-01". */
  month: string;
  /** ISO weekdays, 1 (Monday) - 7 (Sunday). */
  weekdays: number[];
  startTime: string;
  endTime: string;
  excludedDates: string[];
  label?: string;
}): Promise<ActionResult & { count?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_availability_month", {
    p_room_id: input.roomId,
    p_month: input.month,
    p_weekdays: input.weekdays,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_excluded_dates: input.excludedDates,
    p_label: input.label,
  });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true, count: data?.length ?? 0 };
}

/** How many published windows overlap a proposed bulk-removal range —
 * read directly, no RPC needed: availability_windows already grants
 * plain SELECT to authenticated (availability_windows_select_active),
 * same reasoning previewAvailabilityImpactAction below already relies
 * on for reservations. Shown before the admin confirms, so "remove
 * everything in September" isn't a surprise about how much that
 * actually is. */
export async function countAvailabilityWindowsInRangeAction(input: {
  roomId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("availability_windows")
    .select("id", { count: "exact", head: true })
    .eq("room_id", input.roomId)
    .lt("starts_at", input.rangeEnd)
    .gt("ends_at", input.rangeStart);
  return count ?? 0;
}

export async function removeAvailabilityWindowsInRangeAction(input: {
  roomId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<ActionResult & { count?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_availability_windows_in_range", {
    p_room_id: input.roomId,
    p_range_start: input.rangeStart,
    p_range_end: input.rangeEnd,
  });
  if (error) return { ok: false, error: mapBookingError(error.message) };
  revalidatePath("/admin/availability");
  revalidatePath("/calendar");
  return { ok: true, count: data ?? 0 };
}

export interface AffectedReservation {
  id: string;
  purpose: string;
  requesterName: string;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "APPROVED";
}

/** Reservations overlapping a proposed availability change, so an admin
 * can see who's affected before confirming a block/removal/edit — never
 * used to auto-cancel anything, per the "cancellation is a separate,
 * explicit action" rule. Admin RLS (reservations_select_admin) already
 * grants full read access, so this is a plain query, no new RPC. */
export async function previewAvailabilityImpactAction(input: {
  roomId: string;
  startsAt: string;
  endsAt: string;
}): Promise<AffectedReservation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, purpose, requester_name, starts_at, ends_at, status")
    .eq("room_id", input.roomId)
    .in("status", ["PENDING", "APPROVED"])
    .lt("starts_at", input.endsAt)
    .gt("ends_at", input.startsAt);
  return (data ?? []).map((r) => ({
    id: r.id,
    purpose: r.purpose,
    requesterName: r.requester_name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status as "PENDING" | "APPROVED",
  }));
}

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

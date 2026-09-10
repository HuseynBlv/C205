"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapBookingError, stableErrorCode, type StableErrorCode } from "@/lib/booking/errors";
import { drainEmailOutbox } from "@/lib/email/worker";
import type { Tables } from "@/lib/supabase/database.types";

export type Reservation = Tables<"reservations">;

type ActionResult<T = Reservation> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: StableErrorCode };

function toResult<T>(data: T | null, error: { message: string } | null): ActionResult<T> {
  if (error) {
    return { ok: false, error: mapBookingError(error.message), code: stableErrorCode(error.message) };
  }
  return { ok: true, data: data as T };
}

export async function submitRequestAction(input: {
  roomId: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  participantCount: number;
  idempotencyKey?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_request", {
    p_room_id: input.roomId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_purpose: input.purpose,
    p_participant_count: input.participantCount,
    p_idempotency_key: input.idempotencyKey,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/requests");
    revalidatePath("/calendar");
    // submit_request enqueues both the admin notification and the
    // requester's receipt — send them now instead of making both parties
    // wait out the cron interval. Never awaited: this runs after the
    // response is already on its way back, and a delivery hiccup here
    // must never turn a successful submission into a failed one. The
    // scheduled /api/cron/send-emails route remains the reliable
    // fallback if this doesn't get to run for any reason.
    after(() => drainEmailOutbox());
  }
  return result;
}

export async function cancelReservationAction(input: {
  reservationId: string;
  expectedVersion: number;
  reason?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: input.reservationId,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/requests");
    revalidatePath("/admin/reservations");
    revalidatePath("/calendar");
    after(() => drainEmailOutbox());
  }
  return result;
}

export async function approveRequestAction(input: {
  reservationId: string;
  expectedVersion: number;
  override?: boolean;
  overrideReason?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_request", {
    p_reservation_id: input.reservationId,
    p_expected_version: input.expectedVersion,
    p_override: input.override,
    p_override_reason: input.overrideReason,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/admin/reservations");
    revalidatePath("/requests");
    revalidatePath("/calendar");
    after(() => drainEmailOutbox());
  }
  return result;
}

export async function rejectRequestAction(input: {
  reservationId: string;
  expectedVersion: number;
  reason?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_request", {
    p_reservation_id: input.reservationId,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/admin/reservations");
    revalidatePath("/requests");
    after(() => drainEmailOutbox());
  }
  return result;
}

export async function createManualReservationAction(input: {
  roomId: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  participantCount: number;
  requesterName: string;
  requesterEmail: string;
  override?: boolean;
  overrideReason?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_manual_reservation", {
    p_room_id: input.roomId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_purpose: input.purpose,
    p_participant_count: input.participantCount,
    p_requester_name: input.requesterName,
    p_requester_email: input.requesterEmail,
    p_override: input.override,
    p_override_reason: input.overrideReason,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/admin/reservations");
    revalidatePath("/calendar");
    after(() => drainEmailOutbox());
  }
  return result;
}

export async function getConflictWarnings(reservationId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reservation_conflict_warnings", {
    p_reservation_id: reservationId,
  });
  return data ?? [];
}

export async function modifyReservationAction(input: {
  reservationId: string;
  expectedVersion: number;
  startsAt?: string;
  endsAt?: string;
  purpose?: string;
  participantCount?: number;
  override?: boolean;
  overrideReason?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("modify_reservation", {
    p_reservation_id: input.reservationId,
    p_expected_version: input.expectedVersion,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_purpose: input.purpose,
    p_participant_count: input.participantCount,
    p_override: input.override,
    p_override_reason: input.overrideReason,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/admin/reservations");
    revalidatePath("/requests");
    revalidatePath("/calendar");
    after(() => drainEmailOutbox());
  }
  return result;
}

export async function archiveReservationAction(input: {
  reservationId: string;
  expectedVersion: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_reservation", {
    p_reservation_id: input.reservationId,
    p_expected_version: input.expectedVersion,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/admin/reservations");
  }
  return result;
}

export async function unarchiveReservationAction(input: {
  reservationId: string;
  expectedVersion: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unarchive_reservation", {
    p_reservation_id: input.reservationId,
    p_expected_version: input.expectedVersion,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/admin/reservations");
  }
  return result;
}

export async function deleteReservationPermanentlyAction(input: {
  reservationId: string;
  expectedVersion: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_reservation_permanently", {
    p_reservation_id: input.reservationId,
    p_expected_version: input.expectedVersion,
  });
  const result = toResult(data, error);
  if (result.ok) {
    revalidatePath("/admin/reservations");
  }
  return result;
}

/** Fresh copy of one reservation — used to show current values and force
 * a new decision when a STALE_RESERVATION_VERSION error means whatever
 * the admin was looking at has already changed. */
export async function getReservationAction(reservationId: string): Promise<Reservation | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("reservations").select("*").eq("id", reservationId).single();
  return data;
}

"use server";

import { getVerifiedUser, getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getConflictWarnings, type Reservation } from "@/lib/booking/actions";

export type ReservationDetailsTier = "owner" | "admin";

export interface ReservationDetailsResult {
  tier: ReservationDetailsTier;
  reservation: Reservation;
  warnings: string[];
}

/**
 * Returns full reservation detail ONLY when the current viewer is
 * authorized to see it — the authorization boundary here is the
 * `reservations` table's own RLS (`reservations_select_own` /
 * `reservations_select_admin`), the same policies every other screen in
 * this app relies on. This function does nothing but ask, and gets
 * nothing back, for anyone else: there is no field-hiding logic here to
 * get wrong, because the row itself never leaves the database for a
 * bystander's request. `.single()` against zero visible rows and
 * `.single()` against a genuinely nonexistent id come back identically
 * (both `data: null`), so a caller can never distinguish "exists but not
 * yours" from "doesn't exist."
 *
 * A `null` result means the caller must fall back to whatever anonymized
 * data it already has client-side (from `room_occupancy`, which never
 * carried requester identity, purpose, or participant count to begin
 * with) — never retry with different credentials, never assume more
 * access is available another way.
 */
export async function getReservationDetailsAction(
  reservationId: string,
): Promise<ReservationDetailsResult | null> {
  const user = await getVerifiedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("reservations").select("*").eq("id", reservationId).single();
  if (!data) return null;

  const profile = await getCurrentProfile();
  const admin = isActiveAdmin(profile);
  const tier: ReservationDetailsTier = admin ? "admin" : "owner";
  const warnings = admin && data.status === "PENDING" ? await getConflictWarnings(reservationId) : [];

  return { tier, reservation: data, warnings };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Every one of these is a thin wrapper around a SECURITY DEFINER Postgres
 * function (supabase/migrations) — the actual authorization check (caller
 * is an active, verified admin; target row exists; last-admin protection)
 * happens there, live, on every call. Nothing here is trusted on its own:
 * if this action were somehow invoked directly (bypassing the UI, e.g. a
 * forged form POST), the database would still refuse it for the same
 * reasons. See src/app/(app)/admin/accounts/page.tsx for the UI these back.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

async function callAccountRpc(
  fn: "set_account_status",
  profileId: string,
  status: "ACTIVE" | "REJECTED" | "SUSPENDED" | "REMOVED",
  reason?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, {
    p_profile_id: profileId,
    p_status: status,
    p_reason: reason,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/accounts");
  return { ok: true };
}

export async function authorizeAccountAction(profileId: string) {
  return callAccountRpc("set_account_status", profileId, "ACTIVE");
}

export async function rejectAccountAction(profileId: string) {
  return callAccountRpc("set_account_status", profileId, "REJECTED", "Not authorized by USG");
}

export async function suspendAccountAction(profileId: string) {
  return callAccountRpc("set_account_status", profileId, "SUSPENDED", "Suspended by USG");
}

export async function restoreAccountAction(profileId: string) {
  return callAccountRpc("set_account_status", profileId, "ACTIVE");
}

export async function removeAccountAction(profileId: string) {
  return callAccountRpc("set_account_status", profileId, "REMOVED", "Removed by USG");
}

/** Server-side mirror of the same pattern add_usg_notification_recipient()
 * itself enforces, so client-side feedback and the authoritative check
 * never drift apart. */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function addUsgNotificationRecipientAction(email: string): Promise<ActionResult> {
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_usg_notification_recipient", { p_email: email });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "That address is already a recipient." : error.message };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeUsgNotificationRecipientAction(email: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_usg_notification_recipient", { p_email: email });
  if (error) {
    return {
      ok: false,
      error: error.code === "22023" ? "At least one notification recipient must remain." : error.message,
    };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

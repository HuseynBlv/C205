"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Equal-length requirement first: timingSafeEqual throws on a length
  // mismatch rather than returning false, and comparing against a
  // same-length dummy buffer would leak nothing extra worth avoiding here.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function bootstrapFirstAdminAction(formData: FormData): Promise<ActionResult> {
  const user = await getVerifiedUser();
  if (!user) {
    return { ok: false, error: "Sign in first, then come back to this page." };
  }

  const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expected) {
    // Fail closed: an unset secret disables this page entirely rather than
    // accepting any input (or none).
    return { ok: false, error: "First-administrator setup is not enabled on this deployment." };
  }

  const provided = String(formData.get("setupCode") ?? "");
  if (!secretsMatch(provided, expected)) {
    return { ok: false, error: "Incorrect setup code." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_first_admin");
  if (error) {
    // The database's own message is safe to show as-is (e.g. "an
    // administrator already exists", "verify your email first") — it never
    // reveals anything about other accounts.
    return { ok: false, error: error.message };
  }

  redirect("/calendar");
}

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Profile = Tables<"profiles">;

/**
 * The single place that decides whether a request is authenticated.
 *
 * Uses `getClaims()`, never `getSession()`: `getSession()` only reads
 * whatever is in the cookie without confirming the Auth server still
 * considers it valid. `getClaims()` cryptographically verifies the JWT
 * (locally, via the project's JWKS, when using asymmetric signing keys —
 * this project still uses a shared HS256 secret locally, so it transparently
 * falls back to the same server round-trip `getUser()` makes; either way the
 * token is genuinely re-checked, never just decoded). This is what "do not
 * authorize from an unverified cookie" means in practice.
 *
 * Wrapped in React's `cache()` so every call within one request/render pass
 * reuses the same verification instead of re-verifying per component.
 */
export const getVerifiedUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    return null;
  }
  return { id: data.claims.sub, email: data.claims.email as string | undefined };
});

/**
 * The caller's own profile row, straight from the database — never derived
 * from JWT claims. role/account_status/email_verified_at can change between
 * one request and the next (an admin suspends the account, say) without the
 * access token itself changing, so this is deliberately a live read every
 * time it's called, not something cached in the session or the JWT. This is
 * what makes "a suspended account loses access even with a still-valid
 * token" true: nothing here ever trusts the token for anything but identity.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getVerifiedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
});

/** True only when both gates the product requires are satisfied. */
export function hasReservationAccess(profile: Profile | null): profile is Profile {
  return (
    profile !== null &&
    profile.account_status === "ACTIVE" &&
    profile.email_verified_at !== null
  );
}

/** An active, verified admin — the same bar the database functions enforce. */
export function isActiveAdmin(profile: Profile | null): profile is Profile {
  return hasReservationAccess(profile) && profile.role === "ADMIN";
}

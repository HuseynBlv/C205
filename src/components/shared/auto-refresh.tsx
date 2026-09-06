"use client";

import { useRouter } from "next/navigation";
import { useRefreshOnFocus } from "@/lib/hooks/use-refresh-on-focus";

/**
 * Drop into a server-rendered page to keep it current: re-runs the page's
 * server-side data fetch on window focus/visibility and every
 * `intervalMs`. Renders nothing. Intentionally simple polling, not
 * realtime infrastructure — acceptable at this app's scale, and matches
 * the "revalidatePath after mutations" pattern already used everywhere
 * else in the booking engine.
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useRefreshOnFocus(() => router.refresh(), intervalMs);
  return null;
}

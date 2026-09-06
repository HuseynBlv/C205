"use client";

import { useEffect, useRef } from "react";

/**
 * Re-runs `callback` when the tab regains focus/visibility and on a fixed
 * interval while mounted — no realtime/websocket infrastructure, just the
 * same kind of periodic refetch any polling client does. Used to keep
 * booking screens (calendar, my requests, admin review/availability, and
 * the live slot picker) reasonably current against concurrent changes made
 * by other users, without over-fetching.
 */
export function useRefreshOnFocus(callback: () => void, intervalMs: number | null = 60_000) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    function handleFocusLike() {
      if (document.visibilityState === "visible") callbackRef.current();
    }
    window.addEventListener("focus", handleFocusLike);
    document.addEventListener("visibilitychange", handleFocusLike);

    const id = intervalMs ? window.setInterval(() => callbackRef.current(), intervalMs) : undefined;

    return () => {
      window.removeEventListener("focus", handleFocusLike);
      document.removeEventListener("visibilitychange", handleFocusLike);
      if (id) window.clearInterval(id);
    };
  }, [intervalMs]);
}

"use client";

import { useEffect, useState } from "react";

/** SSR-safe: renders as `false` on the server and first client paint,
 * then corrects itself once mounted. Used only for cosmetic layout
 * choices (e.g. which side a panel slides in from) — never for anything
 * that changes what data is fetched or what's authorized. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    void Promise.resolve().then(() => setMatches(mql.matches));
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

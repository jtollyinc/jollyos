"use client";

/**
 * lib/use-media — a media query as React state, SSR-safe.
 * Server render assumes the query does not match (the phone layout is the
 * default); the client corrects after hydration without a setState-in-effect.
 */
import { useSyncExternalStore } from "react";

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's lg breakpoint, where the sidebar replaces the bottom bar. */
export const useIsDesktop = () => useMedia("(min-width: 1024px)");

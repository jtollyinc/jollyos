"use client";

/**
 * lib/use-panel-collapsed — remembered fold state for sections.
 * ────────────────────────────────────────────────────────────────────────────
 * ADHD-first rule: heavy panels default to a one-line truth and REMEMBER the
 * owner's choice. State is per panelId in localStorage; the server renders the
 * default and the stored value is applied after hydration, so the first paint
 * matches the HTML. `useSyncExternalStore` keeps this free of set-state-in-
 * effect patterns.
 */
import { useCallback, useSyncExternalStore } from "react";

const KEY = "jollyos.panels.v1";
const listeners = new Set<() => void>();
let cache: Record<string, boolean> | null = null;

function load(): Record<string, boolean> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    cache = {};
  }
  return cache;
}

function save(next: Record<string, boolean>) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the in-memory copy still works for this session.
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Returns [collapsed, toggle]. `defaultCollapsed` applies until a choice is saved. */
export function usePanelCollapsed(id: string, defaultCollapsed: boolean): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => load()[id] ?? defaultCollapsed,
    () => defaultCollapsed,
  );
  const toggle = useCallback(() => {
    const current = load();
    save({ ...current, [id]: !(current[id] ?? defaultCollapsed) });
  }, [id, defaultCollapsed]);
  return [collapsed, toggle];
}

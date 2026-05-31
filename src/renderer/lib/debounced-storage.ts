/**
 * Debounced localStorage wrapper for Zustand persist middleware.
 *
 * During rapid state changes (e.g. window resize, panel drag), the persist
 * middleware would otherwise call synchronous localStorage.setItem() on every
 * frame — a blocking disk write at 60fps+. This wrapper coalesces writes so
 * they fire at most once per `delay` ms after the last setItem call.
 *
 * getItem is NOT debounced — hydration must complete synchronously on store init.
 * beforeunload flushes any pending writes so state is not lost on app quit.
 */

import type { StateStorage } from "zustand/middleware";

export function createDebouncedStorage(delay = 300): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, string>();

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return;
    pending.forEach((value, key) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Storage full or unavailable — silently drop
      }
    });
    pending.clear();
  };

  // Flush pending writes before the window unloads so the last state is persisted.
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flush);
  }

  return {
    getItem(name: string): string | null {
      // If there's a pending write for this key, return it (consistent read).
      // Otherwise read from localStorage.
      if (pending.has(name)) return pending.get(name)!;
      return localStorage.getItem(name);
    },

    setItem(name: string, value: string): void {
      pending.set(name, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },

    removeItem(name: string): void {
      pending.delete(name);
      try {
        localStorage.removeItem(name);
      } catch {
        // Ignore
      }
    },
  };
}

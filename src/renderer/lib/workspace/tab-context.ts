import { createContext, useContext } from "react";
import type { RightTab } from "./mode-registry";

/**
 * Per-tab context provided by PaneContent so each viewer inside a
 * keep-alive tab reads its OWN tab's data (fileId, filePath, kind, …)
 * instead of the global active-tab from the store.
 *
 * Without this, all mounted (hidden) viewer instances would fight over
 * the same file — the globally active one.
 */
export interface TabContextValue {
  /** The tab this viewer belongs to */
  tab: RightTab;
  /** Whether this tab is currently the active one */
  isActive: boolean;
}

export const TabContext = createContext<TabContextValue | null>(null);

/** Read the current viewer's tab data. Must be called inside a PaneContent child. */
export function useTabContext(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error(
      "useTabContext() must be used within a <PaneContent> child. " +
      "Ensure the component is rendered inside PaneContent.",
    );
  }
  return ctx;
}

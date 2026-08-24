/**
 * Unique side-effect entry for the pixel shell.
 *
 * `computeShellGeometry` owns widths. This module writes live, html marks,
 * and sash/window intent. Sash move must not write store chrome.
 */
import { useSyncExternalStore } from "react";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import { PANEL_COLLAPSE_THRESHOLD_PX } from "@/lib/workspace/layout-constants";
import {
  clampShellLeftPreferredPx,
  clampShellRightPreferredPx,
  computeShellGeometry,
  shellGeometriesEqual,
  shellWindowCanHoldLeftRail,
  type ShellGeometry,
  type ShellGeometryInput,
  type ShellRightMode,
} from "@/lib/workspace/shell-geometry";
import {
  beginShellSashDrag,
  endShellSashDrag,
  isShellSashDragging,
  resolveShellSashWidth,
  shellSashDeltaPx,
  type ShellSashRail,
} from "@/lib/workspace/shell-sash";

export type { ShellSashRail };
import { canSplitSettingsDetail } from "@/lib/workspace/settings-detail-layout";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  RIGHT_AREA_MIN,
  SIDEBAR_LEFT_MAX,
  SIDEBAR_LEFT_MIN,
} from "@/styles/constants";

export type {
  ShellGeometry,
  ShellGeometryInput,
  ShellRightMode,
} from "@/lib/workspace/shell-geometry";

export {
  clampShellLeftPreferredPx,
  clampShellRightPreferredPx,
  computeShellGeometry,
  shellGeometriesEqual,
  shellWindowCanHoldLeftRail,
};

export type ApplyShellSource = "window" | "toggle" | "sash" | "programmatic";

export type ApplyShellOptions = {
  source?: ApplyShellSource;
  sashLeftPx?: number;
  sashRightPx?: number;
};

const EMPTY_LIVE: ShellGeometry = {
  leftPx: SIDEBAR_LEFT_MIN,
  centerPx: 0,
  rightPx: 0,
  rightMode: "closed",
  leftWindowCollapsed: false,
  leftPinToMin: false,
};

type SashSession = {
  rail: ShellSashRail;
  startWidthPx: number;
  startPointerX: number;
  collapsedAtStart: boolean;
};

let live: ShellGeometry = EMPTY_LIVE;
const listeners = new Set<() => void>();
let lastAppliedWindowPx = -1;
let applying = false;
let pendingApply: ApplyShellOptions | null = null;
let windowRaf = 0;
let sashSession: SashSession | null = null;

export function getShellLive(): ShellGeometry {
  return live;
}

export function subscribeShellLive(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useShellLive(): ShellGeometry {
  return useSyncExternalStore(subscribeShellLive, getShellLive, getShellLive);
}

export function resetShellLiveForTests(): void {
  live = EMPTY_LIVE;
  lastAppliedWindowPx = -1;
  applying = false;
  pendingApply = null;
  sashSession = null;
  cancelScheduledShellWindowApply();
  endShellSashDrag();
}

/**
 * Viewport width for water-fill. Do not use `#main-layout.clientWidth` —
 * writing Left can change that box without the window having changed.
 */
export function measureShellGroupPx(): number {
  if (typeof window === "undefined") return 0;
  const px = normalizeWindowPx(window.innerWidth);
  if (px > 0) return px;
  if (typeof document === "undefined") return 0;
  return document.documentElement?.clientWidth ?? 0;
}

/**
 * Window-size signals only. A sash pointer-up must not water-fill.
 */
export function watchShellWindowSize(): () => void {
  const onWindowSize = () => scheduleShellWindowApply();
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || !isShellSashDragging()) return;
    endShellSashDrag();
  };
  window.addEventListener("resize", onWindowSize);
  window.visualViewport?.addEventListener("resize", onWindowSize);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  applyShellWindowLayout({ source: "programmatic" });
  return () => {
    window.removeEventListener("resize", onWindowSize);
    window.visualViewport?.removeEventListener("resize", onWindowSize);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    cancelScheduledShellWindowApply();
  };
}

/** One apply per frame. `resize` and a late layout read must not take two widths. */
export function scheduleShellWindowApply(): void {
  if (typeof requestAnimationFrame !== "function") {
    applyShellWindowLayout({ source: "window" });
    return;
  }
  if (windowRaf !== 0) return;
  windowRaf = requestAnimationFrame(() => {
    windowRaf = 0;
    applyShellWindowLayout({ source: "window" });
  });
}

export function cancelScheduledShellWindowApply(): void {
  if (windowRaf === 0 || typeof cancelAnimationFrame !== "function") {
    windowRaf = 0;
    return;
  }
  cancelAnimationFrame(windowRaf);
  windowRaf = 0;
}

export function deriveShellRightMode(expanded: boolean, maximized: boolean): ShellRightMode {
  if (!expanded) return "closed";
  return maximized ? "maximize" : "split";
}

export function isShellLeftOpen(geo: Pick<ShellGeometry, "leftPx">): boolean {
  return geo.leftPx >= PANEL_COLLAPSE_THRESHOLD_PX;
}

export function isShellRightOpen(geo: Pick<ShellGeometry, "rightPx" | "rightMode">): boolean {
  return geo.rightMode === "maximize" || geo.rightPx >= PANEL_COLLAPSE_THRESHOLD_PX;
}

export function applyShellWindowLayout(
  options: ApplyShellOptions = { source: "programmatic" },
): ShellGeometry {
  const opts = options;
  if (applying) {
    pendingApply = opts;
    return live;
  }
  applying = true;
  try {
    let result = applyShellWindowLayoutOpen(opts);
    while (pendingApply) {
      const next = pendingApply;
      pendingApply = null;
      result = applyShellWindowLayoutOpen(next);
    }
    return result;
  } finally {
    applying = false;
  }
}

export function beginShellSashSession(rail: ShellSashRail, pointerX: number): void {
  const startWidthPx = rail === "left" ? live.leftPx : live.rightPx;
  beginShellSashDrag();
  sashSession = {
    rail,
    startWidthPx,
    startPointerX: pointerX,
    collapsedAtStart: startWidthPx < PANEL_COLLAPSE_THRESHOLD_PX,
  };
}

export function moveShellSashSession(rail: ShellSashRail, pointerX: number): ShellGeometry {
  const resolved = resolveSession(rail, pointerX);
  if (!resolved) return live;
  return applyResolvedSash(rail, resolved);
}

export function commitShellSashSession(rail: ShellSashRail, pointerX: number): ShellGeometry {
  const resolved = resolveSession(rail, pointerX);
  sashSession = null;
  endShellSashDrag();
  if (!resolved) return live;
  return commitShellSashResult(rail, resolved.widthPx, resolved.collapsed);
}

export function commitShellSashResult(
  rail: ShellSashRail,
  widthPx: number,
  collapsed: boolean,
): ShellGeometry {
  const st = useLayoutStore.getState();
  if (rail === "left") {
    if (collapsed) {
      st.setLeftUserExpanded(false);
      st.setLeftWindowCollapsed(false);
      st.setLeftPinToMin(false);
    } else {
      st.setSidebarWidth(widthPx);
      st.setLeftUserExpanded(true);
      st.setLeftWindowCollapsed(false);
      st.setLeftPinToMin(false);
    }
    return applyShellWindowLayout({
      source: "sash",
      sashLeftPx: collapsed ? 0 : widthPx,
    });
  }

  if (st.leftSidebarView === "settings") {
    return commitSettingsSashResult(st, widthPx, collapsed);
  }

  if (collapsed) {
    st.setRightAreaExpanded(false);
    st.setEditorMaximized(false);
    return applyShellWindowLayout({ source: "sash", sashRightPx: 0 });
  }

  const preview = applyShellWindowLayout({ source: "sash", sashRightPx: widthPx });
  if (preview.rightMode === "maximize") {
    st.setRightAreaExpanded(true);
    st.setEditorMaximized(true);
    return applyShellWindowLayout({ source: "programmatic" });
  }

  st.setRightAreaWidth(clampShellRightPreferredPx(widthPx));
  st.setRightAreaExpanded(true);
  st.setEditorMaximized(false);
  return applyShellWindowLayout({ source: "sash", sashRightPx: widthPx });
}

function commitSettingsSashResult(
  st: ReturnType<typeof useLayoutStore.getState>,
  widthPx: number,
  collapsed: boolean,
): ShellGeometry {
  if (collapsed) {
    const rp = useRightPanelStore.getState();
    for (const tab of rp.tabs.filter((t) => t.kind === "settings-editor")) {
      rp.closeTab(tab.id);
    }
    st.setSettingsDetailStacked(false);
    st.setRightAreaExpanded(false);
    return applyShellWindowLayout({ source: "programmatic" });
  }

  const preview = applyShellWindowLayout({ source: "sash", sashRightPx: widthPx });
  if (preview.rightMode === "maximize") {
    st.setSettingsDetailStacked(true);
    st.setRightAreaExpanded(true);
    return applyShellWindowLayout({ source: "programmatic" });
  }

  st.setSettingsDetailWidth(clampShellRightPreferredPx(widthPx));
  st.setSettingsDetailStacked(false);
  st.setRightAreaExpanded(true);
  return applyShellWindowLayout({ source: "sash", sashRightPx: widthPx });
}

function resolveSession(rail: ShellSashRail, pointerX: number) {
  if (!sashSession || sashSession.rail !== rail) return null;
  const deltaPx = shellSashDeltaPx(rail, sashSession.startPointerX, pointerX);
  return resolveShellSashWidth({
    startWidthPx: sashSession.startWidthPx,
    deltaPx,
    minPx: rail === "left" ? SIDEBAR_LEFT_MIN : RIGHT_AREA_MIN,
    maxPx:
      rail === "left"
        ? SIDEBAR_LEFT_MAX
        : Math.max(RIGHT_AREA_MIN, measureShellGroupPx() - live.leftPx),
    collapsedAtStart: sashSession.collapsedAtStart,
  });
}

function applyResolvedSash(
  rail: ShellSashRail,
  resolved: { widthPx: number; collapsed: boolean },
): ShellGeometry {
  return applyShellWindowLayout({
    source: "sash",
    sashLeftPx: rail === "left" ? (resolved.collapsed ? 0 : resolved.widthPx) : undefined,
    sashRightPx: rail === "right" ? (resolved.collapsed ? 0 : resolved.widthPx) : undefined,
  });
}

function applyShellWindowLayoutOpen(opts: ApplyShellOptions): ShellGeometry {
  const source = opts.source ?? "programmatic";
  if (source === "window" && isShellSashDragging()) return live;

  const windowPx = measureShellGroupPx();
  if (source === "window" && windowPx === lastAppliedWindowPx) return live;

  const st = useLayoutStore.getState();
  const inSettings = st.leftSidebarView === "settings";
  const settingsEditorOpen = inSettings && hasOpenSettingsEditor();

  const next = computeShellGeometry({
    windowPx,
    leftUserExpanded: st.leftUserExpanded,
    leftWindowCollapsed: st.leftWindowCollapsed,
    leftPinToMin: st.leftPinToMin,
    leftPreferredPx: st.sidebarWidth,
    rightMode: resolveRightMode(st, inSettings, settingsEditorOpen),
    rightPreferredPx: inSettings ? st.settingsDetailWidth : st.rightAreaWidth,
    rightYieldEnabled: !inSettings,
    crampedLeftAllowed: source === "toggle" && st.leftUserExpanded && !st.leftWindowCollapsed,
    sashLeftPx: opts.sashLeftPx,
    sashRightPx: opts.sashRightPx,
  });

  lastAppliedWindowPx = windowPx;
  if (syncSettingsStackFromWindow(source, windowPx, next, st, inSettings, settingsEditorOpen)) {
    pendingApply = { source: "programmatic" };
  }
  if (shellGeometriesEqual(live, next)) {
    commitShellWindowChrome(next, source, inSettings);
    return live;
  }

  setLive(next);
  writeLeftSidebarWidthVar(st.sidebarWidth);
  commitShellWindowChrome(next, source, inSettings);
  return next;
}

function writeCollapsedMarks(leftPx: number, rightOpen: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute(
    "data-left-sidebar-collapsed",
    leftPx < PANEL_COLLAPSE_THRESHOLD_PX,
  );
  document.documentElement.toggleAttribute("data-right-area-open", rightOpen);
}

function syncSettingsStackFromWindow(
  source: ApplyShellSource,
  windowPx: number,
  next: ShellGeometry,
  st: ReturnType<typeof useLayoutStore.getState>,
  inSettings: boolean,
  settingsEditorOpen: boolean,
): boolean {
  if (source !== "window" || !inSettings || !settingsEditorOpen) return false;
  const available = Math.max(0, windowPx - next.leftPx);
  const canSplit = canSplitSettingsDetail(available);
  if (canSplit === st.settingsDetailStacked) {
    st.setSettingsDetailStacked(!canSplit);
    return true;
  }
  return false;
}

function resolveRightMode(
  st: ReturnType<typeof useLayoutStore.getState>,
  inSettings: boolean,
  settingsEditorOpen: boolean,
): ShellRightMode {
  if (inSettings) {
    if (!settingsEditorOpen) return "closed";
    return st.settingsDetailStacked ? "maximize" : "split";
  }
  return deriveShellRightMode(st.rightAreaExpanded, st.editorMaximized);
}

function setLive(next: ShellGeometry): void {
  live = next;
  for (const listener of listeners) listener();
}

function writeLeftSidebarWidthVar(preferredLeftPx: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--left-sidebar-width",
    `${clampShellLeftPreferredPx(preferredLeftPx)}px`,
  );
}

function commitShellWindowChrome(
  next: ShellGeometry,
  source: ApplyShellSource,
  inSettings: boolean,
): void {
  const rightOpen = next.rightPx >= PANEL_COLLAPSE_THRESHOLD_PX || next.rightMode === "maximize";
  writeCollapsedMarks(next.leftPx, rightOpen);
  if (source === "sash") return;

  const st = useLayoutStore.getState();
  if (st.leftWindowCollapsed !== next.leftWindowCollapsed) {
    st.setLeftWindowCollapsed(next.leftWindowCollapsed);
  }
  if (st.leftPinToMin !== next.leftPinToMin) {
    st.setLeftPinToMin(next.leftPinToMin);
  }

  if (!inSettings && source === "window" && next.rightMode === "closed" && st.rightAreaExpanded) {
    st.setRightAreaExpanded(false);
    st.setEditorMaximized(false);
  }
}

function normalizeWindowPx(windowPx: number): number {
  if (!Number.isFinite(windowPx)) return 0;
  return Math.max(0, Math.round(windowPx));
}

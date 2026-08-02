/**
 * RightArea mode open orchestration — tabs +「+」/ shortcuts / palette.
 *
 * Domain openers (openFile, openLiteraturePaper, …) stay in their domains and
 * only mutate right-panel tabs; call ensureRightAreaOpen when the shell must expand.
 *
 * @see docs-private/superpowers/specs/2026-08-03-rightarea-mode-registration.md
 */
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import {
  openRightArea,
  type RightAreaLayoutCtx,
} from "@/lib/workspace/right-area-layout";

/**
 * - `add` —「+」/ palette: multi modes always spawn; singleton focuses or creates once
 * - `focus` — shortcuts: reuse existing tab if any, else create
 */
export type OpenModeIntent = "add" | "focus";

function revealModeSidebar(modeId: string): void {
  const def = modeRegistry.get(modeId);
  if (def?.Sidebar && !def.hideRightSidebar) {
    useLayoutStore.getState().revealRightSidebar();
  }
}

function spawnMultiTab(modeId: string): void {
  const store = useRightPanelStore.getState();
  if (modeId === "terminal") {
    store.newTerminalTab();
    return;
  }
  if (modeId === "browser") {
    store.newBrowserTab();
    return;
  }
  if (modeId === "literature") {
    store.newLiteratureHomeTab();
    return;
  }
  const def = modeRegistry.get(modeId);
  const kind = def?.tabKinds[0];
  if (kind) store.ensureTab(kind);
}

function focusOrCreate(modeId: string): void {
  const def = modeRegistry.get(modeId);
  if (!def) return;
  const store = useRightPanelStore.getState();
  const existing = store.tabs.filter((t) => def.tabKinds.includes(t.kind));
  if (existing.length > 0) {
    const active = store.tabs.find((t) => t.id === store.activeTabId);
    const preferActive =
      active && def.tabKinds.includes(active.kind) ? active : undefined;
    const home = existing.find((t) => t.isInitial);
    const target = preferActive ?? home ?? existing[0];
    store.setActiveTab(target.id);
    return;
  }
  if (modeId === "terminal") {
    store.newTerminalTab();
    return;
  }
  const kind = def.tabKinds[0];
  if (kind) store.ensureTab(kind);
}

/**
 * Open or focus a RightArea mode (creates/focuses tabs only — no layout mode list).
 */
export function openMode(
  modeId: string,
  opts?: { intent?: OpenModeIntent },
): void {
  const def = modeRegistry.get(modeId);
  if (!def) return;

  if (def.openFromAddMenu) {
    def.openFromAddMenu();
    return;
  }

  const intent = opts?.intent === "focus" ? "focus" : "add";
  const policy = def.addMenuPolicy ?? "singleton";
  if (policy === "multi" && intent === "add") {
    spawnMultiTab(modeId);
  } else {
    focusOrCreate(modeId);
  }

  revealModeSidebar(modeId);
}

/** Expand L1 if needed; no-op when already expanded (preserves drag width). */
export function ensureRightAreaOpen(ctx: RightAreaLayoutCtx): void {
  openRightArea(ctx);
}

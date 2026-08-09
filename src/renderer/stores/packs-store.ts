// Shared packs catalog store (renderer).
//
// Single source of truth for the installed pack list so the settings card
// list (Teams & Agents) and the pack detail panel stay in sync in REAL TIME:
// toggling the project-level enable switch in the detail panel flips the
// shared store first (optimistic), then persists via IPC and reconciles with
// the authoritative catalog from main. No more "close the panel to refresh".
import { create } from "zustand";
import type { Fqid, ProjectPackView, ResolvedMcp } from "@shared/packs/types";

interface PacksStoreState {
  catalog: ProjectPackView[];
  /** Pack-declared MCP servers (app-level resource, project-gated). */
  packMcps: ResolvedMcp[];
  loadedRoot: string | null;
  loading: boolean;
  /** Load the catalog from main. Cached per project root unless `force`. */
  load: (projectRoot: string, options?: { force?: boolean }) => Promise<void>;
  /** Optimistic local flip — instant UI feedback; reconciled by next load. */
  setEnabledLocal: (packId: string, enabled: boolean) => void;
  /** Optimistic per-MCP flip (pack-declared server, disabledContent). */
  setEnabledLocalMcp: (fqid: string, enabled: boolean) => void;
  /** Persist project-level enable/disable to main, then re-load catalog. */
  setEnabled: (
    projectRoot: string,
    packId: string,
    enabled: boolean,
  ) => Promise<{ defaultMovedTo?: Fqid } | void>;
  setPackMcps: (mcps: ResolvedMcp[]) => void;
  clear: () => void;
}

export const usePacksStore = create<PacksStoreState>((set, get) => ({
  catalog: [],
  packMcps: [],
  loadedRoot: null,
  loading: false,

  load: async (projectRoot, options) => {
    if (
      !options?.force &&
      get().loadedRoot === projectRoot &&
      get().catalog.length > 0 &&
      !get().loading
    ) {
      return;
    }
    set({ loading: true });
    try {
      const catalog = await window.electronAPI.packsListCatalog(projectRoot);
      // Pack enable/disable changes the effective MCP set — keep the pack MCP
      // view in sync so the MCP settings page greys out / restores live.
      let packMcps = get().packMcps;
      try {
        packMcps = await window.electronAPI.packsListProjectMcps(projectRoot);
      } catch {
        // non-fatal; pack MCP view stays stale until next load
      }
      set({ catalog, packMcps, loadedRoot: projectRoot });
    } finally {
      set({ loading: false });
    }
  },

  setEnabledLocal: (packId, enabled) => {
    set((s) => ({
      catalog: s.catalog.map((p) =>
        p.manifest.id === packId ? { ...p, enabled } : p,
      ),
      // Flip the owning pack's MCP view too — the MCP settings page greys out
      // in real time while the IPC round trip completes.
      packMcps: s.packMcps.map((m) =>
        m.packId === packId ? { ...m, enabled } : m,
      ),
    }));
  },

  /** Per-item optimistic flip for a pack-declared MCP (disabledContent). */
  setEnabledLocalMcp: (fqid, enabled) => {
    set((s) => ({
      packMcps: s.packMcps.map((m) => (m.fqid === fqid ? { ...m, enabled } : m)),
    }));
  },

  setEnabled: async (projectRoot, packId, enabled) => {
    // Optimistic: flip the UI immediately, then persist + reconcile.
    get().setEnabledLocal(packId, enabled);
    let result: { defaultMovedTo?: Fqid } | undefined;
    try {
      result = (await window.electronAPI.packsSetEnabled(
        projectRoot,
        packId,
        enabled,
      )) as { defaultMovedTo?: Fqid } | undefined;
    } catch (err) {
      // Reconcile on failure: reload to restore the authoritative state.
      await get().load(projectRoot, { force: true });
      throw err;
    }
    await get().load(projectRoot, { force: true });
    return result;
  },

  setPackMcps: (packMcps) => set({ packMcps }),

  clear: () => set({ catalog: [], packMcps: [], loadedRoot: null, loading: false }),
}));

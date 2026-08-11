// Shared teams catalog store (renderer).
//
// Single source of truth for the team list so Settings → Teams, the team
// detail panel, and the marketplace stay in sync in REAL TIME: toggling the
// project-level enable switch flips the shared store first (optimistic), then
// persists via IPC and reconciles with the authoritative catalog from main.
//
// T5: the catalog is TeamViewV2[] (new resolver). A derived `kind` / `locked`
// compatibility field keeps the pre-T5 UI working until each page is reworked.
import { create } from "zustand";
import type { Fqid } from "@shared/teams/types";
import type { AssetViewV2, TeamViewV2 } from "@shared/teams/view";
import { CORE_TEAM_ID } from "@shared/teams/types";

/**
 * TeamViewV2 + legacy display fields the pre-T5 UI still reads.
 * `kind` / `locked` / `installedByDefault` are derived from the v2 fields.
 */
export interface TeamCardView extends TeamViewV2 {
  /** Legacy PackKind equivalent, derived from scope + source. */
  kind: "core" | "firstparty" | "external" | "local";
  /** tier=pro without a license grant. */
  locked: boolean;
  /** core / local / user teams are implicitly installed. */
  installedByDefault: boolean;
}

/** Derive the legacy display fields from a TeamViewV2. */
export function toCardView(t: TeamViewV2): TeamCardView {
  const kind: TeamCardView["kind"] =
    t.manifest.id === CORE_TEAM_ID
      ? "core"
      : t.scope === "project"
        ? "local"
        : t.source === "bundled"
          ? "firstparty"
          : "external";
  return {
    ...t,
    kind,
    locked: t.manifest.tier === "pro" && !t.licenseOk,
    installedByDefault:
      t.source === "core" || t.source === "user" || t.scope === "project",
  };
}

interface TeamsStoreState {
  catalog: TeamCardView[];
  /** Team-declared MCP servers (app-level resource, project-gated). */
  teamMcps: AssetViewV2[];
  /** Project active team id (lead). Shared so list + detail stay in sync. */
  activeTeamId: string | null;
  loadedRoot: string | null;
  loading: boolean;
  /** Load the catalog from main. Cached per project root unless `force`. */
  load: (projectRoot: string, options?: { force?: boolean }) => Promise<void>;
  /** Optimistic local flip — instant UI feedback; reconciled by next load. */
  setEnabledLocal: (teamId: string, enabled: boolean) => void;
  /** Optimistic per-MCP flip (team-declared server, tri-state). */
  setEnabledLocalMcp: (fqid: string, enabled: boolean) => void;
  /** Persist project-level enable/disable to main, then re-load catalog. */
  setEnabled: (
    projectRoot: string,
    teamId: string,
    enabled: boolean,
  ) => Promise<{ defaultMovedTo?: string } | void>;
  /** Persist active team, update store immediately, then reconcile. */
  setActiveTeam: (projectRoot: string, teamId: string) => Promise<void>;
  setTeamMcps: (mcps: AssetViewV2[]) => void;
  clear: () => void;
}

export const useTeamsStore = create<TeamsStoreState>((set, get) => ({
  catalog: [],
  teamMcps: [],
  activeTeamId: null,
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
      const [raw, active] = await Promise.all([
        window.electronAPI.teamsList(projectRoot),
        window.electronAPI.teamsGetActiveTeam(projectRoot).catch(() => null),
      ]);
      const catalog = raw.map(toCardView);
      // Team enable/disable changes the effective MCP set — keep the team MCP
      // view in sync so the MCP settings page greys out / restores live.
      let teamMcps = get().teamMcps;
      try {
        teamMcps = await window.electronAPI.teamsListProjectMcps(projectRoot);
      } catch {
        // non-fatal; team MCP view stays stale until next load
      }
      set({
        catalog,
        teamMcps,
        activeTeamId: active?.manifest.id ?? null,
        loadedRoot: projectRoot,
      });
    } finally {
      set({ loading: false });
    }
  },

  setEnabledLocal: (teamId, enabled) => {
    set((s) => ({
      catalog: s.catalog.map((p) =>
        p.manifest.id === teamId ? { ...p, enabled } : p,
      ),
      teamMcps: s.teamMcps.map((m) =>
        m.teamId === teamId ? { ...m, enabled } : m,
      ),
    }));
  },

  setEnabledLocalMcp: (fqid, enabled) => {
    set((s) => ({
      teamMcps: s.teamMcps.map((m) => (m.fqid === fqid ? { ...m, enabled } : m)),
    }));
  },

  setEnabled: async (projectRoot, teamId, enabled) => {
    get().setEnabledLocal(teamId, enabled);
    let result: { defaultMovedTo?: string } | undefined;
    try {
      result = (await window.electronAPI.teamsSetEnabled(
        projectRoot,
        teamId,
        enabled,
      )) as { defaultMovedTo?: string } | undefined;
    } catch (err) {
      await get().load(projectRoot, { force: true });
      throw err;
    }
    await get().load(projectRoot, { force: true });
    return result;
  },

  setActiveTeam: async (projectRoot, teamId) => {
    set({ activeTeamId: teamId });
    try {
      await window.electronAPI.teamsSetActiveTeam(projectRoot, teamId, "project");
    } catch (err) {
      await get().load(projectRoot, { force: true });
      throw err;
    }
    // Project default won — drop tab overrides so Composer matches Settings.
    const { useChatStore } = await import("./chat-store");
    useChatStore.getState().clearSessionTeamOverrides();
    await get().load(projectRoot, { force: true });
    try {
      const { useCommandStore } = await import("./command-store");
      await useCommandStore.getState().refreshSlashAllow();
    } catch {
      // non-fatal — slash menu refreshes on next commands load
    }
  },

  setTeamMcps: (teamMcps) => set({ teamMcps }),

  clear: () =>
    set({ catalog: [], teamMcps: [], activeTeamId: null, loadedRoot: null, loading: false }),
}));

/** Back-compat alias while call sites migrate (T5). */
export const usePacksStore = useTeamsStore;

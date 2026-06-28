import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getArchivedSessionIdsForProject,
  getPinnedSessionIdsForProject,
  loadSessionUiPrefsIntoLayout,
  toggleArchiveSessionForProject,
} from "../../src/renderer/lib/chat/session-ui-prefs";
import { useLayoutStore } from "../../src/renderer/stores/layout-store";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";

const PROJECT_A = "/Users/test/project-a";
const PROJECT_B = "/Users/test/project-b";

describe("session-ui-prefs", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: {
        archivedSessionIdsByProject: {
          [PROJECT_A]: ["sess-archived-a"],
        },
        pinnedSessionIdsByProject: {
          [PROJECT_A]: ["sess-pinned-a"],
          [PROJECT_B]: ["sess-pinned-b"],
        },
      },
      loaded: true,
    });
    useLayoutStore.setState({
      archivedSessionIds: [],
      pinnedSessionIds: [],
      showArchived: true,
    });
    vi.stubGlobal("electronAPI", {
      settingsSet: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("returns archived and pinned session ids per project", () => {
    expect(getArchivedSessionIdsForProject(PROJECT_A)).toEqual(["sess-archived-a"]);
    expect(getArchivedSessionIdsForProject(PROJECT_B)).toEqual([]);
    expect(getPinnedSessionIdsForProject(PROJECT_A)).toEqual(["sess-pinned-a"]);
    expect(getPinnedSessionIdsForProject(PROJECT_B)).toEqual(["sess-pinned-b"]);
  });

  it("loads persisted prefs into layout store for the active project", () => {
    loadSessionUiPrefsIntoLayout(PROJECT_A);

    expect(useLayoutStore.getState().archivedSessionIds).toEqual(["sess-archived-a"]);
    expect(useLayoutStore.getState().pinnedSessionIds).toEqual(["sess-pinned-a"]);
    expect(useLayoutStore.getState().showArchived).toBe(false);
  });

  it("persists archive toggles per project", async () => {
    loadSessionUiPrefsIntoLayout(PROJECT_A);
    await toggleArchiveSessionForProject(PROJECT_A, "sess-new");

    expect(useLayoutStore.getState().archivedSessionIds).toEqual([
      "sess-archived-a",
      "sess-new",
    ]);
    expect(useSettingsStore.getState().settings.archivedSessionIdsByProject?.[PROJECT_A]).toEqual([
      "sess-archived-a",
      "sess-new",
    ]);
    expect(window.electronAPI.settingsSet).toHaveBeenCalledWith({
      archivedSessionIdsByProject: {
        [PROJECT_A]: ["sess-archived-a", "sess-new"],
      },
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  partitionRightTabs,
  resolveSurfaceActiveTabId,
} from "../../src/renderer/hooks/use-settings-editor";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";

function tab(id: string, kind: RightTab["kind"]): RightTab {
  return {
    id,
    kind,
    title: id,
    isPreview: false,
    isPinned: false,
    isInitial: false,
  };
}

describe("partitionRightTabs", () => {
  it("splits settings and workspace tabs", () => {
    const tabs = [tab("w1", "files"), tab("s1", "settings-editor"), tab("w2", "git")];
    const { workspaceTabs, settingsTabs } = partitionRightTabs(tabs);
    expect(workspaceTabs.map((t) => t.id)).toEqual(["w1", "w2"]);
    expect(settingsTabs.map((t) => t.id)).toEqual(["s1"]);
  });
});

describe("resolveSurfaceActiveTabId", () => {
  it("keeps active id when it belongs to the surface", () => {
    const tabs = [tab("s1", "settings-editor"), tab("s2", "settings-editor")];
    expect(resolveSurfaceActiveTabId(tabs, "s1")).toBe("s1");
  });

  it("falls back to last surface tab when active is outside surface", () => {
    const tabs = [tab("s1", "settings-editor"), tab("s2", "settings-editor")];
    expect(resolveSurfaceActiveTabId(tabs, "workspace-tab")).toBe("s2");
  });
});

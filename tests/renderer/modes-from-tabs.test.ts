import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import {
  activeModeIds,
  focusedModeId,
  hasMode,
  notifyModeLifecycleTransitions,
} from "@/lib/workspace/modes-from-tabs";

function tab(partial: Partial<RightTab> & Pick<RightTab, "id" | "kind">): RightTab {
  return {
    title: partial.title ?? partial.kind,
    isInitial: partial.isInitial ?? false,
    ...partial,
  };
}

function ensureMode(def: ModeDefinition): void {
  if (!modeRegistry.get(def.id)) modeRegistry.register(def);
}

beforeAll(() => {
  const stub = (
    id: string,
    tabKinds: ModeDefinition["tabKinds"],
  ): ModeDefinition => ({
    id,
    label: id,
    icon: null,
    tabKinds,
    initialTitle: id,
    Content: () => null,
  });
  ensureMode(stub("files", ["file"]));
  ensureMode(stub("browser", ["browser"]));
  ensureMode(stub("terminal", ["terminal"]));
  ensureMode(stub("git", ["git-overview", "git-diff"]));
});

describe("modes-from-tabs", () => {
  it("activeModeIds is unique and preserves first-seen order", () => {
    const tabs = [
      tab({ id: "a", kind: "file" }),
      tab({ id: "b", kind: "browser" }),
      tab({ id: "c", kind: "file" }),
      tab({ id: "d", kind: "git-overview" }),
    ];
    expect(activeModeIds(tabs)).toEqual(["files", "browser", "git"]);
  });

  it("hasMode / focusedModeId follow tabs + activeTabId", () => {
    const tabs = [
      tab({ id: "a", kind: "file" }),
      tab({ id: "b", kind: "terminal" }),
    ];
    expect(hasMode(tabs, "files")).toBe(true);
    expect(hasMode(tabs, "literature")).toBe(false);
    expect(focusedModeId(tabs, "b")).toBe("terminal");
    expect(focusedModeId(tabs, null)).toBe("dashboard");
    expect(focusedModeId(tabs, "missing")).toBe("dashboard");
  });

  describe("notifyModeLifecycleTransitions", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("fires onActivate only on 0→1 and onDeactivate only on 1→0", () => {
      const files = modeRegistry.get("files");
      const browser = modeRegistry.get("browser");
      expect(files && browser).toBeTruthy();
      const onActivateFiles = vi.fn();
      const onDeactivateFiles = vi.fn();
      const onActivateBrowser = vi.fn();
      const onDeactivateBrowser = vi.fn();
      const prevActivate = files!.onActivate;
      const prevDeactivate = files!.onDeactivate;
      const prevBA = browser!.onActivate;
      const prevBD = browser!.onDeactivate;
      files!.onActivate = onActivateFiles;
      files!.onDeactivate = onDeactivateFiles;
      browser!.onActivate = onActivateBrowser;
      browser!.onDeactivate = onDeactivateBrowser;

      const empty: RightTab[] = [];
      const withFiles = [tab({ id: "f1", kind: "file" })];
      const withBoth = [
        tab({ id: "f1", kind: "file" }),
        tab({ id: "b1", kind: "browser" }),
      ];
      const withBrowserOnly = [tab({ id: "b1", kind: "browser" })];

      notifyModeLifecycleTransitions(empty, withFiles);
      expect(onActivateFiles).toHaveBeenCalledTimes(1);
      expect(onDeactivateFiles).not.toHaveBeenCalled();

      notifyModeLifecycleTransitions(withFiles, withBoth);
      expect(onActivateBrowser).toHaveBeenCalledTimes(1);
      expect(onActivateFiles).toHaveBeenCalledTimes(1);

      notifyModeLifecycleTransitions(withBoth, withBrowserOnly);
      expect(onDeactivateFiles).toHaveBeenCalledTimes(1);
      expect(onDeactivateBrowser).not.toHaveBeenCalled();

      notifyModeLifecycleTransitions(withBrowserOnly, empty);
      expect(onDeactivateBrowser).toHaveBeenCalledTimes(1);

      // home-replace: same mode tab count → no lifecycle
      const home = [tab({ id: "f1", kind: "file", isInitial: true })];
      const detail = [tab({ id: "f1", kind: "file", isInitial: false, filePath: "a.tex" })];
      notifyModeLifecycleTransitions(home, detail);
      expect(onActivateFiles).toHaveBeenCalledTimes(1);
      expect(onDeactivateFiles).toHaveBeenCalledTimes(1);

      files!.onActivate = prevActivate;
      files!.onDeactivate = prevDeactivate;
      browser!.onActivate = prevBA;
      browser!.onDeactivate = prevBD;
    });
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureWorkbenchProjectExpanded,
  isWorkbenchProjectExpanded,
  toggleWorkbenchProjectExpanded,
} from "@/stores/workbench-store";

const REPO = join(import.meta.dirname, "../..");

function sourceOf(rel: string): string {
  return readFileSync(join(REPO, rel), "utf-8");
}

describe("workbench folder expand", () => {
  it("opens only the focused project before the user toggles anything", () => {
    expect(isWorkbenchProjectExpanded("p_a", null, "p_a")).toBe(true);
    expect(isWorkbenchProjectExpanded("p_b", null, "p_a")).toBe(false);
  });

  it("keeps an explicit empty list collapsed, including the focused project", () => {
    expect(isWorkbenchProjectExpanded("p_a", [], "p_a")).toBe(false);
  });

  it("toggles from the default focus-only set without snapping back", () => {
    const collapsed = toggleWorkbenchProjectExpanded("p_a", null, "p_a");
    expect(collapsed).toEqual([]);
    expect(isWorkbenchProjectExpanded("p_a", collapsed, "p_a")).toBe(false);
    expect(toggleWorkbenchProjectExpanded("p_b", collapsed, "p_a")).toEqual(["p_b"]);
  });

  it("ensure adds a project without dropping others", () => {
    expect(ensureWorkbenchProjectExpanded("p_b", ["p_a"], "p_a")).toEqual(["p_a", "p_b"]);
    expect(ensureWorkbenchProjectExpanded("p_a", ["p_a"], "p_a")).toEqual(["p_a"]);
  });
});

describe("workbench sidebar wiring", () => {
  it("does not mount a current-project switcher", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    const settings = sourceOf("src/renderer/components/modules/settings/settings-sidebar.tsx");
    expect(sidebar).not.toContain("ProjectSwitcher");
    expect(settings).not.toContain("ProjectSwitcher");
    expect(sidebar).toContain("data-workbench-project");
    expect(sidebar).toContain("toggleProjectExpanded");
    expect(sidebar).not.toMatch(/onClick=\{\(\) => toggleProjectExpanded[\s\S]*focusProject/);
  });

  it("loads a session on row click and does not open a project when toggling a folder", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    expect(sidebar).toContain("loadSession(s.id, s.directory, s.projectLastPath)");
    expect(sidebar).toContain("onClick={() => toggleProjectExpanded(member.id)}");
    expect(sidebar).not.toContain("openProject(");
  });
});

import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isLeftNavRequired,
  moveLeftNavOrder,
  optionalPrimaryNavItems,
  resolvePrimaryNavItems,
  sanitizeLeftNavPrefs,
  toggleLeftNavHidden,
} from "../../src/renderer/lib/workspace/left-nav/customize";
import { GitBranchIcon } from "lucide-react";
import {
  leftNavFromWorkspaceMode,
  lucideIconFromMode,
} from "../../src/renderer/lib/workspace/left-nav/mode-nav";
import type { ModeDefinition } from "../../src/renderer/lib/workspace/mode-registry";

const primary = [
  { id: "new-agent", order: 0, required: true },
  { id: "files", order: 10 },
  { id: "git", order: 20 },
  { id: "texworkspace", order: 30 },
  { id: "literature", order: 40 },
  { id: "experiments", order: 50 },
];

describe("left nav customize", () => {
  it("keeps New Chat visible and first", () => {
    const next = resolvePrimaryNavItems(primary, {
      hiddenIds: ["new-agent", "literature"],
      order: ["git", "new-agent", "literature"],
    });
    expect(next.map((item) => item.id)).toEqual([
      "new-agent",
      "git",
      "texworkspace",
    ]);
    expect(next.every((item) => item.id !== "literature" || isLeftNavRequired(item))).toBe(true);
  });

  it("drops unknown ids and required ids from hidden", () => {
    const prefs = sanitizeLeftNavPrefs(
      { hiddenIds: ["new-agent", "nope", "experiments"], order: ["nope", "literature", "git"] },
      primary,
    );
    expect(prefs.hiddenIds).toEqual(["experiments", "files"]);
    expect(prefs.order[0]).toBe("literature");
    expect(prefs.order).toContain("new-agent");
    expect(prefs.order).not.toContain("nope");
  });

  it("rewrites the old TeX nav id", () => {
    const prefs = sanitizeLeftNavPrefs(
      { hiddenIds: ["tex-workspace"], order: ["tex-workspace", "literature"] },
      primary,
    );
    expect(prefs.hiddenIds).toEqual(["texworkspace", "files", "git", "experiments"]);
    expect(prefs.order[0]).toBe("texworkspace");
    expect(prefs.order).not.toContain("tex-workspace");
  });

  it("lists optional items in saved order including hidden ones", () => {
    const optional = optionalPrimaryNavItems(primary, {
      order: ["git", "texworkspace"],
      hiddenIds: ["texworkspace"],
    });
    expect(optional.map((item) => item.id)).toEqual([
      "git",
      "texworkspace",
      "literature",
      "files",
      "experiments",
    ]);
    expect(optional.some((item) => item.id === "templates" || item.id === "teams")).toBe(false);
  });

  it("defaults the module Nav to TeX Workspace and Library", () => {
    const next = resolvePrimaryNavItems(primary, undefined);
    expect(next.map((item) => item.id)).toEqual([
      "new-agent",
      "texworkspace",
      "literature",
    ]);
    const prefs = sanitizeLeftNavPrefs(undefined, primary);
    expect(prefs.hiddenIds).toEqual(["files", "git", "experiments"]);
  });

  it("hides a newly registered module until the user opts in", () => {
    const withNotebook = [...primary, { id: "notebook", order: 60 }];
    const prefs = sanitizeLeftNavPrefs(
      { hiddenIds: ["files"], order: ["texworkspace", "literature", "files"] },
      withNotebook,
    );
    expect(prefs.hiddenIds).toContain("notebook");
    expect(prefs.hiddenIds).toContain("git");
    expect(prefs.hiddenIds).not.toContain("literature");
  });

  it("does not hide a required id", () => {
    expect(toggleLeftNavHidden(["literature"], "new-agent", ["new-agent"])).toEqual(["literature"]);
    expect(toggleLeftNavHidden(["literature"], "literature", ["new-agent"])).toEqual([]);
    expect(toggleLeftNavHidden([], "literature", ["new-agent"])).toEqual(["literature"]);
  });

  it("reorders optional ids", () => {
    expect(moveLeftNavOrder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveLeftNavOrder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveLeftNavOrder(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("projects a workspace mode into a customizable nav slot", () => {
    const mode = {
      id: "git",
      label: "Git",
      labelKey: "modes.git.label",
      icon: createElement(GitBranchIcon, { className: "size-3.5" }),
      tabKinds: ["git-overview"],
    } as unknown as ModeDefinition;
    const item = leftNavFromWorkspaceMode(mode, 20);
    expect(item.id).toBe("git");
    expect(item.section).toBe("primary");
    expect(item.required).toBeUndefined();
    expect(item.deactivate).toBeUndefined();
    expect(item.icon).toBe(GitBranchIcon);
    expect(item.shortcutId).toBe("workspace.openGit");
    expect(lucideIconFromMode(mode)).toBe(GitBranchIcon);
  });

  it("wires the sidebar menu and settings keys", () => {
    const sidebar = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/left-sidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("CustomizeSidebarDialog");
    expect(sidebar).toContain("nav.customizeSidebar.menu");
    expect(sidebar).toContain("resolvePrimaryNavItems");
    expect(sidebar).toContain('getBySection("hub")');
    expect(sidebar).toContain('role="separator"');
    const dialog = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/customize-sidebar-dialog.tsx"),
      "utf-8",
    );
    expect(dialog).toContain("useVerticalListReorder");
    expect(dialog).toContain("indicatorTop");
    const settings = readFileSync(
      join(import.meta.dirname, "../../src/renderer/stores/settings-store.ts"),
      "utf-8",
    );
    expect(settings).toContain("leftNavHiddenIds");
    expect(settings).toContain("leftNavOrder");
    const items = readFileSync(
      join(import.meta.dirname, "../../src/renderer/lib/workspace/left-nav/items.tsx"),
      "utf-8",
    );
    expect(items).toContain('section: "hub"');
    expect(items).not.toContain('id: "literature"');
    expect(items).not.toContain('id: "tex-workspace"');
    const registry = readFileSync(
      join(import.meta.dirname, "../../src/renderer/lib/workspace/mode-registry.ts"),
      "utf-8",
    );
    expect(registry).toContain("getLeftNavModes");
  });
});

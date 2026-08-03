import { beforeAll, describe, expect, it } from "vitest";
import type { ModeDefinition } from "@/lib/workspace/mode-registry";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { getRightAreaLauncherModes } from "@/lib/workspace/right-area-launcher-modes";

function ensureMode(def: ModeDefinition): void {
  if (!modeRegistry.get(def.id)) {
    modeRegistry.register(def);
  }
}

function stub(
  id: string,
  tabKinds: ModeDefinition["tabKinds"],
  extra?: Partial<ModeDefinition>,
): ModeDefinition {
  return {
    id,
    label: id,
    icon: null,
    tabKinds,
    initialTitle: id,
    surface: "workspace",
    Content: () => null,
    ...extra,
  };
}

describe("getRightAreaLauncherModes", () => {
  beforeAll(() => {
    ensureMode(stub("files", ["file"]));
    ensureMode(stub("git", ["git-overview", "git-diff"]));
    ensureMode(stub("browser", ["browser"], { addMenuPolicy: "multi" }));
    ensureMode(stub("terminal", ["terminal"], { addMenuPolicy: "multi" }));
    ensureMode(stub("texworkspace", ["texworkspace"]));
    ensureMode(stub("literature", ["literature"], { addMenuPolicy: "multi" }));
    ensureMode(stub("experiments", ["experiments"]));
    ensureMode(stub("research-plan", ["research-plan"], { showInAddMenu: false }));
    ensureMode(stub("interaction", ["interaction"], { showInAddMenu: false }));
    ensureMode(
      stub("settings-editor", ["settings-editor"], {
        surface: "settings",
        showInAddMenu: false,
      }),
    );
  });

  it("lists workspace add-menu modes from the registry (not hardcoded)", () => {
    const launcher = getRightAreaLauncherModes();
    const fromRegistry = modeRegistry.getAddMenuModes("workspace");
    expect(launcher.map((m) => m.id)).toEqual(fromRegistry.map((m) => m.id));
  });

  it("excludes settings-only and hidden modes", () => {
    const ids = getRightAreaLauncherModes().map((m) => m.id);
    expect(ids).not.toContain("settings-editor");
    expect(ids).not.toContain("research-plan");
    expect(ids).not.toContain("interaction");
  });

  it("includes the seven primary workspace modes", () => {
    const ids = new Set(getRightAreaLauncherModes().map((m) => m.id));
    expect(ids).toEqual(
      new Set([
        "files",
        "git",
        "browser",
        "terminal",
        "texworkspace",
        "literature",
        "experiments",
      ]),
    );
  });
});

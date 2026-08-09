// Regression: the prompt stack preview must follow the configured default
// main agent (orchestrator). Setting a non-core default orchestrator must
// change both the resolved orchestrator and the rendered orchestrator-agent
// section — otherwise "set default main agent" is a no-op in the UI.
import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { promptManager } from "../../src/main/prompts";
import { buildPromptStackPreview } from "../../src/main/prompts/stack-preview";
import { registerExternalPackRoot, unregisterExternalPackRoot } from "../../src/main/services/pack-catalog";
import { resolveOrchestratorId } from "../../src/main/services/pack-resolver";
import { setPacksInstalledDataDir } from "../../src/main/services/packs-installed";
import { setDefaultOrchestratorFqid, setPackEnabled } from "../../src/main/services/packs-state";
import { addInstalledPack } from "../../src/main/services/packs-installed";
import { CORE_PACK_ID } from "../../src/shared/packs/types";
import { baseManifest, makePack, makeProjectRoot, makeTempDir } from "./packs-test-utils";

const externalRoots: string[] = [];
function registerRoot(dir: string): void {
  registerExternalPackRoot(dir);
  externalRoots.push(dir);
}

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => ({}),
}));

const tempDirs: string[] = [];
function temp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}
function makeRoot(): string {
  const root = makeProjectRoot();
  tempDirs.push(root);
  setPacksInstalledDataDir(temp());
  return root;
}

afterEach(() => {
  for (const dir of externalRoots) unregisterExternalPackRoot(dir);
  externalRoots.length = 0;
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setPacksInstalledDataDir(null);
  promptManager.invalidate();
});

describe("prompt stack follows default orchestrator", () => {
  it("preview switches with the default main agent", async () => {
    const root = makeRoot();
    const coreRoot = temp();
    makePack(coreRoot, CORE_PACK_ID, baseManifest(CORE_PACK_ID, { publisher: "prismnext" }), {
      orchestrators: [{ id: "research-prism" }],
      experts: [{ id: "peer-reviewer" }],
    });
    registerRoot(coreRoot);
    addInstalledPack(CORE_PACK_ID);

    const freeRoot = temp();
    makePack(freeRoot, "test.notes", baseManifest("test.notes", { name: "Notes" }), {
      orchestrators: [{ id: "notes-lead" }],
      experts: [{ id: "note-expert" }],
    });
    registerRoot(freeRoot);
    addInstalledPack("test.notes");

    // 默认 = core research-prism
    expect(resolveOrchestratorId(root)).toBe("prismnext.core:research-prism");
    let preview = await buildPromptStackPreview({ projectRoot: root });
    expect(preview.orchestratorId).toBe("research-prism");
    expect(preview.orchestratorName).toBe("research-prism");
    const coreAgent = preview.sections.find((s) => s.id === "orchestrator-agent");
    expect(coreAgent?.content).toContain("research-prism");

    // 换成 notes-lead
    setDefaultOrchestratorFqid(root, "test.notes:notes-lead");
    expect(resolveOrchestratorId(root)).toBe("test.notes:notes-lead");
    preview = await buildPromptStackPreview({ projectRoot: root });
    expect(preview.orchestratorId).toBe("test.notes--notes-lead");
    expect(preview.orchestratorName).toBe("notes-lead");
    const notesAgent = preview.sections.find((s) => s.id === "orchestrator-agent");
    expect(notesAgent?.content).toContain("notes-lead");
    // 与 core 的 content 不同,证明真的换了
    expect(notesAgent?.content).not.toEqual(coreAgent?.content);
  });

  it("falls back to the core default when the default's pack is disabled in this project", async () => {
    const root = makeRoot();
    const coreRoot = temp();
    makePack(coreRoot, CORE_PACK_ID, baseManifest(CORE_PACK_ID, { publisher: "prismnext" }), {
      orchestrators: [{ id: "research-prism" }],
      experts: [{ id: "peer-reviewer" }],
    });
    registerRoot(coreRoot);
    addInstalledPack(CORE_PACK_ID);

    const freeRoot = temp();
    makePack(freeRoot, "test.notes", baseManifest("test.notes", { name: "Notes" }), {
      orchestrators: [{ id: "notes-lead" }],
      experts: [{ id: "note-expert" }],
    });
    registerRoot(freeRoot);
    addInstalledPack("test.notes");

    // User set the notes team as default…
    setDefaultOrchestratorFqid(root, "test.notes:notes-lead");
    expect(resolveOrchestratorId(root)).toBe("test.notes:notes-lead");

    // …then disabled that pack in THIS project. The effective default must
    // fall back to the core agent (its content is no longer active) — the UI
    // reads `defaultOrchestratorFqid` from getCoreState, so the DEFAULT badge
    // must NOT stay on a project-disabled team.
    setPackEnabled(root, "test.notes", false);
    expect(resolveOrchestratorId(root)).toBe("prismnext.core:research-prism");
    const preview = await buildPromptStackPreview({ projectRoot: root });
    expect(preview.orchestratorId).toBe("research-prism");
  });
});

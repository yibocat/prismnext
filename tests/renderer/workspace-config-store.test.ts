import { describe, it, expect, beforeEach, vi } from "vitest";

// IMPORTANT: Mock window.electronAPI BEFORE importing the store
// The store module references window.electronAPI, so we must stub it
vi.stubGlobal("window", {
  electronAPI: {
    workspaceGetConfig: vi.fn().mockResolvedValue([]),
    workspaceUpdateConfig: vi.fn().mockResolvedValue({ success: true }),
    workspaceGetFunctionDefaults: vi.fn().mockResolvedValue({ defaultDescription: null }),
  },
});

import { useWorkspaceConfigStore } from "../../src/renderer/stores/workspace-config-store";

describe("workspace-config-store", () => {
  beforeEach(() => {
    useWorkspaceConfigStore.getState().reset();
  });

  it("has empty initial state", () => {
    const { workspaceDirs, manuscriptConfig } = useWorkspaceConfigStore.getState();
    expect(workspaceDirs).toEqual([]);
    expect(manuscriptConfig).toBeNull();
  });

  it("manuscriptConfig is derived from workspaceDirs", () => {
    useWorkspaceConfigStore.getState().setWorkspaceDirs([
      { function: "manuscript" as const, name: "paper", mainTex: "article.tex" },
      { function: "literature" as const, name: "lit" },
    ]);
    const config = useWorkspaceConfigStore.getState().manuscriptConfig;
    expect(config).toEqual({ dir: "paper", mainTex: "article.tex" });
  });

  it("manuscriptConfig is null when no manuscript folder", () => {
    useWorkspaceConfigStore.getState().setWorkspaceDirs([
      { function: "literature" as const, name: "lit" },
    ]);
    expect(useWorkspaceConfigStore.getState().manuscriptConfig).toBeNull();
  });

  it("addFolder pushes a new entry", () => {
    const store = useWorkspaceConfigStore.getState();
    store.addFolder("experiment", "my-experiment");
    expect(useWorkspaceConfigStore.getState().workspaceDirs).toHaveLength(1);
    expect(useWorkspaceConfigStore.getState().workspaceDirs[0]).toMatchObject({
      function: "experiment",
      name: "my-experiment",
    });
  });

  it("addFolder prevents duplicate names", () => {
    const store = useWorkspaceConfigStore.getState();
    store.addFolder("literature", "refs");
    store.addFolder("literature", "refs"); // duplicate
    expect(useWorkspaceConfigStore.getState().workspaceDirs).toHaveLength(1);
  });

  it("addFolder prevents second manuscript", () => {
    const store = useWorkspaceConfigStore.getState();
    store.addFolder("manuscript", "paper1");
    store.addFolder("manuscript", "paper2"); // should be ignored
    expect(useWorkspaceConfigStore.getState().workspaceDirs).toHaveLength(1);
  });

  it("removeFolder deletes by index", () => {
    useWorkspaceConfigStore.setState({
      workspaceDirs: [
        { function: "manuscript" as const, name: "paper", mainTex: "main.tex" },
        { function: "literature" as const, name: "lit" },
      ],
    });
    useWorkspaceConfigStore.getState().removeFolder(1);
    expect(useWorkspaceConfigStore.getState().workspaceDirs).toHaveLength(1);
    expect(useWorkspaceConfigStore.getState().workspaceDirs[0].function).toBe("manuscript");
  });

  it("updateFolder modifies an entry", () => {
    useWorkspaceConfigStore.setState({
      workspaceDirs: [
        { function: "manuscript" as const, name: "paper", mainTex: "main.tex" },
      ],
    });
    useWorkspaceConfigStore.getState().updateFolder(0, { name: "doc", mainTex: "index.tex" });
    const dir = useWorkspaceConfigStore.getState().workspaceDirs[0];
    expect(dir.name).toBe("doc");
    expect((dir as any).mainTex).toBe("index.tex");
  });
});

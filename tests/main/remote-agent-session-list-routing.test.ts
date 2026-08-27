import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  forgetRemoteConversation,
  lookupRemoteProfileIdForProject,
  rememberRemoteConversation,
  remoteProfileIdFromAgentArgs,
  resolveRemoteAgentListTarget,
} from "../../src/main/remote/agent-route";
import {
  registerRemoteWorkbenchProject,
  resolveProjectLastPath,
} from "../../src/main/workbench/default-project";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/agent.ts"), "utf8");
const sidebar = readFileSync(
  join(__dirname, "../../src/renderer/components/layout/left-sidebar.tsx"),
  "utf8",
);
const preload = readFileSync(join(__dirname, "../../src/preload/agent.ts"), "utf8");
const addMenu = readFileSync(
  join(__dirname, "../../src/renderer/components/layout/workbench-add-menu.tsx"),
  "utf8",
);
const projectSelector = readFileSync(
  join(__dirname, "../../src/renderer/components/modules/chat/project-selector.tsx"),
  "utf8",
);
const lifecycle = readFileSync(
  join(__dirname, "../../src/renderer/lib/workspace/project-lifecycle.ts"),
  "utf8",
);

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveRemoteAgentListTarget", () => {
  it("mirrors sessions for an unbound remote projectRoot", () => {
    expect(resolveRemoteAgentListTarget(
      { projectId: "p_B", projectRoot: "remote://lab/home/u/b" },
      { isBound: () => false, lookupProjectId: () => null },
    )).toEqual({ kind: "remote", profileId: "lab", bound: false });
  });

  it("routes a bound profile to Host even when live is another project", () => {
    expect(resolveRemoteAgentListTarget(
      { projectId: "p_B", projectRoot: "remote://lab/home/u/b" },
      {
        isBound: (profileId) => profileId === "lab",
        lookupProjectId: (projectId) => (projectId === "p_A" ? "lab" : null),
      },
    )).toEqual({ kind: "remote", profileId: "lab", bound: true });
  });

  it("resolves a projectId-only list from the workbench lastPath registry", () => {
    const lastPathById: Record<string, string> = {
      p_B: "remote://lab/home/u/b",
    };
    expect(resolveRemoteAgentListTarget(
      { projectId: "p_B" },
      {
        isBound: () => false,
        lookupProjectId: (projectId) => lookupRemoteProfileIdForProject(
          projectId,
          () => null,
          (id) => lastPathById[id] ?? null,
        ),
      },
    )).toEqual({ kind: "remote", profileId: "lab", bound: false });
  });

  it("keeps a local projectRoot on this computer", () => {
    expect(resolveRemoteAgentListTarget(
      { projectId: "p_local", projectRoot: "/Users/me/paper" },
      { isBound: () => true, lookupProjectId: () => null },
    )).toEqual({ kind: "local" });
  });

  it("leaves a remembered remote chat when the next projectRoot is local", () => {
    rememberRemoteConversation("tab-1", "lab");
    try {
      expect(remoteProfileIdFromAgentArgs(
        { conversationId: "tab-1", projectId: "p_local", projectRoot: "/Users/me/paper" },
        () => "lab",
      )).toBeNull();
      expect(resolveRemoteAgentListTarget(
        { conversationId: "tab-1", projectRoot: "/Users/me/paper" },
        { isBound: () => false, lookupProjectId: () => "lab" },
      )).toEqual({ kind: "local" });
    } finally {
      forgetRemoteConversation("tab-1");
    }
  });
});

describe("resolveProjectLastPath", () => {
  it("returns the remote lastPath for a workbench member", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "rw60-last-path-"));
    temps.push(homeDir);
    registerRemoteWorkbenchProject(
      { projectId: "p_B", lastPath: "remote://lab/home/u/b", displayName: "B" },
      { homeDir },
    );
    expect(resolveProjectLastPath("p_B", { homeDir })).toBe("remote://lab/home/u/b");
    expect(resolveProjectLastPath("missing", { homeDir })).toBeNull();
  });
});

describe("RW-6.0 wiring", () => {
  it("uses lastPath lookup and the shared list-target helper in agent IPC", () => {
    expect(ipc).toContain("resolveRemoteAgentListTarget");
    expect(ipc).toContain("lookupRemoteProfileIdForProject");
    expect(ipc).toContain("resolveProjectLastPath");
    expect(ipc).toContain("projectRoot");
    expect(ipc).toContain("forgetRemoteConversation");
    expect(ipc).toContain("agent:reassignSessionProject");
    expect(ipc).toContain("offline_session_missing");
    expect(ipc).not.toContain("readOnly: true");
  });

  it("passes member.lastPath as projectRoot from the sidebar", () => {
    expect(sidebar).toContain("projectRoot: member.lastPath");
    expect(preload).toContain("projectRoot");
  });

  it("routes Chat and remote picker opens through applyProjectPick", () => {
    expect(addMenu).not.toContain("openRemoteAndToast");
    expect(addMenu).toContain("applyProjectPick");
    expect(projectSelector).toContain("applyProjectPick");
    expect(projectSelector).not.toContain("openRemoteWorkbenchProject");
    expect(lifecycle).toContain("ensureRemoteProjectReady");
  });
});

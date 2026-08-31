import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteOperationError } from "../../src/shared/remote";
import { routeHostDomainMethod } from "../../src/main/remote/domain-route";
import { projectLifecycleAuthority } from "../../src/main/project/project-lifecycle-authority";
import { projectHandlers } from "../../src/host/project-handlers";

const scaffold = readFileSync(join(__dirname, "../../src/main/ipc/project-scaffold.ts"), "utf8");
const workspace = readFileSync(join(__dirname, "../../src/main/ipc/workspace.ts"), "utf8");
const host = readFileSync(join(__dirname, "../../src/host/project-handlers.ts"), "utf8");

describe("remote scaffold / workspace IPC routing", () => {
  afterEach(() => {
    projectLifecycleAuthority.close();
  });

  it("forwards create/check/ensure/workspace through domain-route and does not fake success", () => {
    expect(scaffold).toContain("routeHostDomainMethod");
    expect(workspace).toContain("routeHostDomainMethod");
    expect(scaffold).not.toContain("isRemoteProjectRoot");
    expect(workspace).not.toContain("isRemoteProjectRoot");
    expect(scaffold).not.toContain("missing: []");
    expect(workspace).not.toMatch(/isRemoteProjectRoot[\s\S]{0,120}success:\s*true/);
    expect(host).toContain("project:create");
    expect(host).toContain("project:check");
    expect(host).toContain("project:ensure");
    expect(host).toContain("workspace:getConfig");
    expect(host).toContain("workspace:updateConfig");
  });

  it("rewrites project:check rootPath to POSIX", async () => {
    const invoke = vi.fn().mockResolvedValue({ missing: [] });
    await routeHostDomainMethod("project:check", { rootPath: "remote://lab/home/u/p" }, {
      keys: ["rootPath", "projectRoot"],
      broker: { isBound: () => true, invoke },
    });
    expect(invoke).toHaveBeenCalledWith("lab", "project:check", { rootPath: "/home/u/p" });
  });

  it("throws not_connected when the Host is unbound", async () => {
    await expect(routeHostDomainMethod("project:check", { rootPath: "remote://lab/home/u/p" }, {
      keys: ["rootPath", "projectRoot"],
      broker: { isBound: () => false, invoke: vi.fn() },
    })).rejects.toBeInstanceOf(RemoteOperationError);
  });

  it("Host project:ensure fills folders for an id-only workbench.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-ensure-"));
    mkdirSync(join(root, ".workbench"), { recursive: true });
    writeFileSync(join(root, ".workbench", "workbench.json"), `${JSON.stringify({ id: "p_old" }, null, 2)}\n`);
    const ctx = { remoteRoot: root, projectId: "p_old", emit: () => undefined };
    await projectHandlers["project:ensure"]({ rootPath: root }, ctx);
    const json = JSON.parse(readFileSync(join(root, ".workbench", "workbench.json"), "utf8")) as {
      workspace?: { folders?: unknown[] };
    };
    expect(json.workspace?.folders?.length).toBeGreaterThan(0);
    expect(existsSync(join(root, "manuscript"))).toBe(true);
  });

  it("Host project.open reuses id and keeps existing workspace folders", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-open-"));
    mkdirSync(join(root, ".workbench"), { recursive: true });
    writeFileSync(
      join(root, ".workbench", "workbench.json"),
      `${JSON.stringify({
        id: "p_keep",
        workspace: { folders: [{ function: "literature", name: "refs" }] },
      }, null, 2)}\n`,
    );
    const ctx = { remoteRoot: null, projectId: null, emit: () => undefined };
    const opened = await projectHandlers["project.open"]({ remoteRoot: root }, ctx) as {
      projectId: string;
    };
    expect(opened.projectId).toBe("p_keep");
    const json = JSON.parse(readFileSync(join(root, ".workbench", "workbench.json"), "utf8")) as {
      id: string;
      workspace?: { folders?: Array<{ name: string }> };
    };
    expect(json.id).toBe("p_keep");
    expect(json.workspace?.folders?.[0]?.name).toBe("refs");
  });

  it("Host project.open adoptId overwrites a colliding workbench.json id", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-adopt-"));
    mkdirSync(join(root, ".workbench"), { recursive: true });
    writeFileSync(
      join(root, ".workbench", "workbench.json"),
      `${JSON.stringify({ id: "p_local_copy" }, null, 2)}\n`,
    );
    const ctx = { remoteRoot: null, projectId: null, emit: () => undefined };
    const opened = await projectHandlers["project.open"]({
      remoteRoot: root,
      adoptId: "p_remote_copy",
    }, ctx) as { projectId: string };
    expect(opened.projectId).toBe("p_remote_copy");
    const json = JSON.parse(readFileSync(join(root, ".workbench", "workbench.json"), "utf8")) as {
      id: string;
    };
    expect(json.id).toBe("p_remote_copy");
  });
});

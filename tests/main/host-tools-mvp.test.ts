import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentNativeTools, REMOTE_MODULE_PENDING } from "../../src/main/agent/agent-service";
import { createHostContext, dispatchHostMethod, listRegisteredHostMethods } from "../../src/host/handler-registry";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("host agent methods", () => {
  it("registers literature and experiment list on the Host (not via lazy import)", () => {
    expect(listRegisteredHostMethods()).toEqual(
      expect.arrayContaining(["literature:list", "experiment:list", "compile:execute"]),
    );
  });

  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("lists empty sessions for a bound remote root", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-tools-"));
    setWorkbenchUserHomeOverride(home);
    const paper = join(home, "paper");
    mkdirSync(paper, { recursive: true });
    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    const listed = await dispatchHostMethod("agent:listSessions", { projectRoot: paper }, ctx);
    expect(listed).toEqual([]);
  });

  it("writes a file under the bound root and can echo from that directory", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-fs-"));
    const paper = join(home, "paper");
    mkdirSync(paper, { recursive: true });
    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    const absPath = join(paper, "ok.txt");
    await dispatchHostMethod("fs:write", { absPath, content: "remote-ok" }, ctx);
    expect(readFileSync(absPath, "utf8")).toBe("remote-ok");
    const echoed = execSync("echo remote-ok", { cwd: paper, encoding: "utf8" }).trim();
    expect(echoed).toBe("remote-ok");
  });

  it("no longer stubs latex-compile as pending", async () => {
    const tools = createAgentNativeTools({ pendingRemoteModules: true });
    const compile = tools.find((tool) => tool.name === "latex-compile");
    expect(compile).toBeTruthy();
    expect(compile!.execute).not.toEqual(undefined);
    const interaction = tools.find((tool) => tool.name === "interaction-open");
    if (interaction) {
      const result = await interaction.execute({}, {
        runtimeSessionId: "rt",
        tabId: "tab",
        turnId: "t1",
        toolCallId: "c1",
        projectRoot: "/tmp/paper",
        permissionMode: "auto",
      });
      expect(result).toEqual({ ok: false, error: REMOTE_MODULE_PENDING });
    }
  });

  it("keeps experiment-run registered without the SSH-drop kill note", async () => {
    const tools = createAgentNativeTools({
      remoteJobNote: false,
      runExperiment: async () => ({ ok: true, started: true }),
    });
    const run = tools.find((tool) => tool.name === "experiment-run");
    const result = await run!.execute({ id: "exp-1", command: "echo hi" }, {
      runtimeSessionId: "rt",
      tabId: "tab",
      turnId: "t1",
      toolCallId: "c1",
      projectRoot: "/tmp/paper",
      permissionMode: "auto",
    });
    expect(result).toMatchObject({ ok: true, started: true });
    expect(result).not.toHaveProperty("remoteNote");
  });
});

describe("host.configure", () => {
  it("defaults to remote BYOK and can switch to the laptop gateway", async () => {
    const ctx = createHostContext();
    expect(ctx.modelKeys).toBe("remote");
    const gateway = await dispatchHostMethod("host.configure", { modelKeys: "gateway" }, ctx);
    expect(gateway).toEqual({
      ok: true,
      modelKeys: "gateway",
      providerIds: [],
      wrapOk: false,
      persisted: false,
    });
    expect(ctx.modelKeys).toBe("gateway");
  });
});

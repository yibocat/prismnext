import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executionTargetFromArgs,
  remoteProfileFromArgs,
  routeHostDomainMethod,
} from "../../src/main/remote/domain-route";
import { projectLifecycleAuthority } from "../../src/main/project/project-lifecycle-authority";

describe("domain-route ExecutionTarget", () => {
  afterEach(() => {
    projectLifecycleAuthority.close();
  });

  it("reads a remote root from the named args keys", () => {
    expect(executionTargetFromArgs(
      { projectRoot: "remote://lab/home/u/p" },
      ["projectRoot"],
    )).toEqual({
      kind: "remote",
      profileId: "lab",
      abs: "/home/u/p",
      encoded: "remote://lab/home/u/p",
    });
    expect(remoteProfileFromArgs({ projectId: "p_local" }, ["projectRoot", "projectId"])).toBeNull();
  });

  it("returns undefined when args have no remote path and currentRoot is off", async () => {
    projectLifecycleAuthority.activate("remote://lab/home/focused");
    const invoke = vi.fn();
    const result = await routeHostDomainMethod("compile:detectTexlive", {}, {
      keys: ["projectRoot"],
      useCurrentRoot: false,
      broker: { isBound: () => true, invoke },
    });
    expect(result).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rewrites compile projectDir and terminal projectRoot to POSIX", async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const broker = { isBound: () => true, invoke };

    await routeHostDomainMethod("compile:execute", {
      projectDir: "remote://lab/home/u/paper",
      mainFile: "main.tex",
    }, {
      keys: ["projectDir"],
      broker,
    });
    expect(invoke).toHaveBeenCalledWith("lab", "compile:execute", {
      projectDir: "/home/u/paper",
      mainFile: "main.tex",
    });

    invoke.mockClear();
    await routeHostDomainMethod("terminal:saveConfig", {
      projectRoot: "remote://lab/tmp/p",
      config: { quickCommands: [] },
    }, {
      keys: ["projectRoot"],
      broker,
    });
    expect(invoke).toHaveBeenCalledWith("lab", "terminal:saveConfig", {
      projectRoot: "/tmp/p",
      config: { quickCommands: [] },
    });
  });

  it("prefers args.projectRoot over the focused currentRoot", async () => {
    projectLifecycleAuthority.activate("remote://lab-a/home/a");
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    await routeHostDomainMethod("execution:get", {
      executionId: "e1",
      projectRoot: "remote://lab-b/home/b",
    }, {
      keys: ["projectRoot", "projectId"],
      useCurrentRoot: true,
      broker: { isBound: () => true, invoke },
    });
    expect(invoke).toHaveBeenCalledWith("lab-b", "execution:get", {
      executionId: "e1",
      projectRoot: "/home/b",
    });
  });
});

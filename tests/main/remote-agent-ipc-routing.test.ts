import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESKTOP_ONLY_AGENT_METHODS,
  HOST_AGENT_METHODS,
  disconnectedRemoteAgentProbe,
  disconnectedRemoteAgentStatus,
  remoteProfileIdFromAgentArgs,
  rewriteAgentParamsForHost,
} from "../../src/main/remote/agent-route";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/agent.ts"), "utf8");

describe("remote agent IPC routing", () => {
  it("lists every Host-bound method and wires it in ipc/agent.ts", () => {
    for (const method of HOST_AGENT_METHODS) {
      expect(ipc).toContain(`routeIfRemote("${method}"`);
    }
  });

  it("keeps catalog and key methods on the desktop", () => {
    for (const method of DESKTOP_ONLY_AGENT_METHODS) {
      expect(ipc).not.toContain(`routeIfRemote("${method}"`);
    }
  });

  it("resolves a remote profile from projectRoot and rewrites the path", () => {
    expect(remoteProfileIdFromAgentArgs({
      projectRoot: "remote://lab/home/ubuntu/paper",
      apiKey: "sk-secret",
    })).toBe("lab");
    expect(rewriteAgentParamsForHost({
      projectRoot: "remote://lab/home/ubuntu/paper",
      text: "hi",
    })).toEqual({
      projectRoot: "/home/ubuntu/paper",
      text: "hi",
    });
    expect(rewriteAgentParamsForHost({
      projectRoot: "remote://lab/home/ubuntu/paper",
      boundCheckoutPath: "remote://lab/home/ubuntu/.prismnext/projects/p_ab/worktrees/calm-owl/checkout",
    })).toEqual({
      projectRoot: "/home/ubuntu/paper",
      boundCheckoutPath: "/home/ubuntu/.prismnext/projects/p_ab/worktrees/calm-owl/checkout",
    });
  });

  it("does not route a local folder", () => {
    expect(remoteProfileIdFromAgentArgs({ projectRoot: "/Users/me/paper" })).toBeNull();
  });

  it("returns a ready=false status while SSH is down", () => {
    const status = disconnectedRemoteAgentStatus("remote://lab/home/ubuntu/paper");
    expect(status.ready).toBe(false);
    expect(status.reason).toBe("remote_not_connected");
    expect(status.projectRoot).toBe("remote://lab/home/ubuntu/paper");
  });

  it("does not throw for offline replica polls", () => {
    expect(disconnectedRemoteAgentProbe("agent:syncIntensiveReading")).toEqual({ ok: true });
    expect(disconnectedRemoteAgentProbe("agent:send")).toEqual({
      ok: false,
      error: "remote_not_connected",
    });
  });
});

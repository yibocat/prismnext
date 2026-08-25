import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { RemoteOperationError } from "../shared/remote";
import type { HostHandlerContext } from "./context";

interface LivePty {
  child: ChildProcessWithoutNullStreams;
}

const sessions = new Map<string, LivePty>();

function requireRoot(ctx: HostHandlerContext): string {
  if (!ctx.remoteRoot) {
    throw new RemoteOperationError("not_connected", "No remote project is bound on this connection.");
  }
  return ctx.remoteRoot;
}

export const terminalHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "terminal:create"(params, ctx) {
    const cwd = requireRoot(ctx);
    const sessionId = String(params.sessionId ?? "");
    const tabId = String(params.tabId ?? "");
    if (!sessionId) throw new RemoteOperationError("protocol", "terminal sessionId required");
    const existing = sessions.get(sessionId);
    if (existing) {
      existing.child.kill("SIGTERM");
      sessions.delete(sessionId);
    }
    const child = spawn("/bin/bash", ["-i"], {
      cwd,
      env: { ...process.env, TERM: "xterm-256color", PWD: cwd },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const send = (data: string) => {
      ctx.emit("terminal:data", { sessionId, tabId, data });
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => send(chunk));
    child.stderr.on("data", (chunk: string) => send(chunk));
    child.on("exit", (code) => {
      sessions.delete(sessionId);
      ctx.emit("terminal:exit", { sessionId, tabId, exitCode: code ?? 0 });
    });
    sessions.set(sessionId, { child });
    return { ok: true, cwd };
  },

  async "terminal:write"(params) {
    const sessionId = String(params.sessionId ?? "");
    const live = sessions.get(sessionId);
    if (!live) return { ok: false };
    live.child.stdin.write(String(params.data ?? ""));
    return { ok: true };
  },

  async "terminal:resize"() {
    return { ok: true };
  },

  async "terminal:destroy"(params) {
    const sessionId = String(params.sessionId ?? "");
    const live = sessions.get(sessionId);
    if (live) {
      live.child.kill("SIGTERM");
      sessions.delete(sessionId);
    }
    return { ok: true };
  },
};

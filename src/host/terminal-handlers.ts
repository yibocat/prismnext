import { RemoteOperationError } from "../shared/remote";
import { loadConfig, saveConfig, type TerminalConfig } from "../main/terminal/terminal-config";
import type { HostHandlerContext } from "./context";
import { requireRemoteRoot, resolveHostProjectPath } from "./project-path";
import { spawnHostPty, type HostPty } from "./terminal-pty";

const sessions = new Map<string, HostPty>();

function resolveTerminalCwd(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  const requested = typeof params.cwd === "string" ? params.cwd.trim() : "";
  if (requested) return resolveHostProjectPath(ctx, requested);
  return requireRemoteRoot(ctx);
}

export const terminalHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "terminal:create"(params, ctx) {
    const cwd = resolveTerminalCwd(params, ctx);
    const sessionId = String(params.sessionId ?? "");
    const tabId = String(params.tabId ?? "");
    if (!sessionId) throw new RemoteOperationError("protocol", "terminal sessionId required");
    const existing = sessions.get(sessionId);
    if (existing) {
      existing.kill();
      sessions.delete(sessionId);
    }
    const cols = Number(params.cols);
    const rows = Number(params.rows);
    const pty = spawnHostPty(
      cwd,
      Number.isFinite(cols) && cols > 0 ? cols : 80,
      Number.isFinite(rows) && rows > 0 ? rows : 24,
    );
    pty.onData((data) => {
      ctx.emit("terminal:data", { sessionId, tabId, data });
    });
    pty.onExit((code) => {
      sessions.delete(sessionId);
      ctx.emit("terminal:exit", { sessionId, tabId, exitCode: code });
    });
    sessions.set(sessionId, pty);
    return { ok: true, cwd, shell: pty.shell, pid: pty.pid, backend: pty.backend };
  },

  async "terminal:write"(params) {
    const sessionId = String(params.sessionId ?? "");
    const live = sessions.get(sessionId);
    if (!live) return { ok: false };
    live.write(String(params.data ?? ""));
    return { ok: true };
  },

  async "terminal:resize"(params) {
    const sessionId = String(params.sessionId ?? "");
    const live = sessions.get(sessionId);
    if (!live) return { ok: false };
    const cols = Number(params.cols);
    const rows = Number(params.rows);
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) {
      return { ok: false };
    }
    live.resize(Math.floor(cols), Math.floor(rows));
    return { ok: true };
  },

  async "terminal:destroy"(params) {
    const sessionId = String(params.sessionId ?? "");
    const live = sessions.get(sessionId);
    if (live) {
      live.kill();
      sessions.delete(sessionId);
    }
    return { ok: true };
  },

  async "terminal:loadConfig"(params) {
    return loadConfig(String(params.projectRoot ?? ""));
  },

  async "terminal:saveConfig"(params) {
    saveConfig(String(params.projectRoot ?? ""), params.config as TerminalConfig);
    return { ok: true };
  },
};

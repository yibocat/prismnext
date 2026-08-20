import * as pty from "node-pty";
import type { IPty } from "node-pty";
import { basename } from "node:path";
import { getShellIntegrationLaunch } from "./terminal-integration";
import { createLogger, shortLogDetail } from "./logger";

const log = createLogger("terminal", "general");

// ─── Types ───

export type TerminalSessionStatus = "starting" | "running" | "exited" | "killed" | "error";

export interface TerminalSession {
  pty: IPty;
  sessionId: string;
  tabId: string;
  projectRoot: string;
  cwd: string;
  shell: string;
  pid: number;
  status: TerminalSessionStatus;
  createdAt: number;
  exitedAt?: number;
  exitCode?: number;
}

export interface TerminalEnvInfo {
  shell: string;
  cwd: string;
  platform: string;
  nodeVersion: string;
  home: string;
}

export interface CreateSessionArgs {
  sessionId: string;
  tabId: string;
  projectRoot: string;
  cwd: string;
  onData: (sessionId: string, tabId: string, data: string) => void;
  onExit: (sessionId: string, tabId: string, exitCode: number) => void;
}

// ─── State ───

const sessions = new Map<string, TerminalSession>();

// ─── Service ───

/** Detect the user's default shell from environment. */
export function detectDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function killSession(session: TerminalSession): void {
  try {
    session.pty.kill();
  } catch {
    // idempotent — process may already be dead
  }
  session.status = "killed";
  sessions.delete(session.sessionId);
}

/** Spawn a new PTY session. Returns session metadata. */
export function createSession(
  args: CreateSessionArgs,
): { shell: string; cwd: string; pid: number; tabId: string } {
  const { sessionId, tabId, projectRoot, cwd, onData, onExit } = args;

  // Replace duplicate sessionId if a late cleanup races with a new mount.
  if (sessions.has(sessionId)) {
    destroySession(sessionId);
  }

  const shell = detectDefaultShell();
  const integration = getShellIntegrationLaunch(shell);

  let ptyProcess: IPty;
  try {
    ptyProcess = pty.spawn(shell, integration.args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        ...integration.env,
        TERM: "xterm-256color",
      } as { [key: string]: string },
    });
  } catch (err) {
    log.warn("terminal.session.fail", {
      op: "create",
      project: basename(projectRoot),
      error: shortLogDetail(err),
    });
    throw new Error(`Failed to spawn PTY in ${cwd}`);
  }

  ptyProcess.onData((data: string) => {
    onData(sessionId, tabId, data);
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    const existing = sessions.get(sessionId);
    if (existing) {
      existing.status = "exited";
      existing.exitCode = exitCode;
      existing.exitedAt = Date.now();
      sessions.delete(sessionId);
    }
    onExit(sessionId, tabId, exitCode);
  });

  const session: TerminalSession = {
    pty: ptyProcess,
    sessionId,
    tabId,
    projectRoot,
    cwd,
    shell,
    pid: ptyProcess.pid,
    status: "running",
    createdAt: Date.now(),
  };

  sessions.set(sessionId, session);
  return { shell, cwd, pid: ptyProcess.pid, tabId };
}

/** Write data to a PTY session's stdin. No-op if session not found. */
export function writeToSession(sessionId: string, data: string): void {
  sessions.get(sessionId)?.pty.write(data);
}

/** Resize a PTY session's terminal dimensions. No-op if session not found. */
export function resizeSession(sessionId: string, cols: number, rows: number): void {
  sessions.get(sessionId)?.pty.resize(cols, rows);
}

/** Kill and remove a single PTY session (idempotent — no error if not found). */
export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    killSession(session);
  }
}

/** Kill all sessions whose IDs start with `prefix` (e.g. tab close). */
export function destroySessionsByPrefix(prefix: string): void {
  for (const [id, session] of sessions) {
    if (id.startsWith(prefix)) {
      killSession(session);
    }
  }
}

/** Kill all sessions for the given tab ids. */
export function destroySessionsByTabIds(tabIds: string[]): void {
  for (const tabId of tabIds) {
    destroySessionsByPrefix(`${tabId}:`);
  }
}

/** Kill all sessions belonging to a project root. */
export function destroySessionsByProject(projectRoot: string): void {
  for (const [, session] of sessions) {
    if (session.projectRoot === projectRoot) {
      killSession(session);
    }
  }
}

/** Kill all active PTY sessions (e.g., on window close). */
export function destroyAllSessions(): void {
  for (const [, session] of sessions) {
    killSession(session);
  }
}

/** Gather environment info for the sidebar display. */
export function getEnvInfo(): TerminalEnvInfo {
  return {
    shell: detectDefaultShell(),
    cwd: process.cwd(),
    platform: process.platform,
    nodeVersion: process.version,
    home: process.env.HOME || process.env.USERPROFILE || "",
  };
}

/** @internal Test helpers */
export function _getSessionCountForTests(): number {
  return sessions.size;
}

export function _resetSessionsForTests(): void {
  sessions.clear();
}

export function _getSessionForTests(sessionId: string): TerminalSession | undefined {
  return sessions.get(sessionId);
}

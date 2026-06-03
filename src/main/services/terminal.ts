import * as pty from "node-pty";
import type { IPty } from "node-pty";

// ─── Types ───

export interface TerminalSession {
  pty: IPty;
  sessionId: string;
  cwd: string;
  shell: string;
  pid: number;
}

export interface TerminalEnvInfo {
  shell: string;
  cwd: string;
  platform: string;
  nodeVersion: string;
  home: string;
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

/** Spawn a new PTY session. Returns session metadata. */
export function createSession(
  sessionId: string,
  cwd: string,
  onData: (sessionId: string, data: string) => void,
  onExit: (sessionId: string, exitCode: number) => void,
): { shell: string; cwd: string; pid: number } {
  const shell = detectDefaultShell();

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: "xterm-256color" } as { [key: string]: string },
  });

  ptyProcess.onData((data: string) => {
    onData(sessionId, data);
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    sessions.delete(sessionId);
    onExit(sessionId, exitCode);
  });

  const session: TerminalSession = {
    pty: ptyProcess,
    sessionId,
    cwd,
    shell,
    pid: ptyProcess.pid,
  };

  sessions.set(sessionId, session);
  return { shell, cwd, pid: ptyProcess.pid };
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
    session.pty.kill();
    sessions.delete(sessionId);
  }
}

/** Kill all sessions whose IDs start with `prefix` (e.g. tab close). */
export function destroySessionsByPrefix(prefix: string): void {
  for (const [id, session] of sessions) {
    if (id.startsWith(prefix)) {
      session.pty.kill();
      sessions.delete(id);
    }
  }
}

/** Kill all active PTY sessions (e.g., on window close). */
export function destroyAllSessions(): void {
  for (const [id, session] of sessions) {
    session.pty.kill();
    sessions.delete(id);
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

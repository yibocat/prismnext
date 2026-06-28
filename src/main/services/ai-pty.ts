import * as pty from "node-pty";
import type { IPty } from "node-pty";

export interface RunAiCommandArgs {
  command: string;
  cwd: string;
  sessionId: string;
  chatTabId: string;
  requestId: string;
  toolCallId?: string;
  onChunk: (chunk: string) => void;
}

export interface RunAiCommandResult {
  output: string;
  exitCode: number;
  cwd: string;
}

interface ActiveRun {
  sessionId: string;
  chatTabId: string;
  requestId: string;
  pty: IPty;
}

/** In-flight AI bash jobs keyed by OpenCode sessionId (one serial slot per session). */
const activeBySession = new Map<string, ActiveRun>();

function shellArgs(command: string): string[] {
  if (process.platform === "win32") {
    return ["/c", command];
  }
  const shell = shellBinary();
  // Non-interactive one-shot: skip rc/profile (avoids macOS bash→zsh nag + bash-3.2$ prompt).
  if (shell.includes("zsh")) {
    return ["-f", "-c", command];
  }
  return ["--noprofile", "--norc", "-c", command];
}

function shellBinary(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  if (process.platform === "darwin") {
    return "/bin/zsh";
  }
  return process.env.SHELL || "/bin/bash";
}

/** Cancel any in-flight AI command for this OpenCode session. */
export function cancelAiCommandForSession(sessionId: string): void {
  const active = activeBySession.get(sessionId);
  if (!active) return;
  try {
    active.pty.kill();
  } catch {
    // ignore
  }
  activeBySession.delete(sessionId);
}

/** @deprecated Use cancelAiCommandForSession — resolves chatTabId via registry when needed. */
export function cancelAiCommandForChat(chatTabId: string): void {
  for (const [sessionId, active] of activeBySession.entries()) {
    if (active.chatTabId === chatTabId) {
      cancelAiCommandForSession(sessionId);
      return;
    }
  }
}

export function runAiCommand(args: RunAiCommandArgs): Promise<RunAiCommandResult> {
  const { command, cwd, sessionId, chatTabId, requestId, onChunk } = args;
  const trimmed = command.trim();
  if (!trimmed) {
    const message = "Prism AI bash: empty command";
    onChunk(message);
    return Promise.resolve({ output: message, exitCode: 1, cwd });
  }

  cancelAiCommandForSession(sessionId);

  return new Promise((resolve) => {
    let output = "";
    let settled = false;

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      activeBySession.delete(sessionId);
      resolve({ output, exitCode, cwd });
    };

    let ptyProcess: IPty;
    try {
      ptyProcess = pty.spawn(shellBinary(), shellArgs(trimmed), {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
        } as { [key: string]: string },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onChunk(message);
      finish(1);
      return;
    }

    activeBySession.set(sessionId, { sessionId, chatTabId, requestId, pty: ptyProcess });

    ptyProcess.onData((data) => {
      output += data;
      onChunk(data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      finish(exitCode ?? 1);
    });
  });
}

/** Kill every in-flight AI PTY (app quit / window teardown). */
export function destroyAllAiPty(): void {
  for (const active of activeBySession.values()) {
    try {
      active.pty.kill();
    } catch {
      // ignore
    }
  }
  activeBySession.clear();
}

/** @internal */
export function _resetAiPtyForTests(): void {
  destroyAllAiPty();
}

/** @internal */
export function _getActiveAiPtyCountForTests(): number {
  return activeBySession.size;
}

/** @internal */
export function _hasActiveAiPtyForSession(sessionId: string): boolean {
  return activeBySession.has(sessionId);
}

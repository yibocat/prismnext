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
  /** Extra env vars merged into the PTY child process. */
  envExtra?: Record<string, string>;
  /**
   * Optional absolute file path. When supplied, the wrapped shell will
   * redirect the *command's* stderr into this file (via `( $cmd ) 2>$path`),
   * while stdout still flows through the PTY for live streaming. After the
   * PTY exits, the file is read and returned as `stderr` on the result.
   *
   * Why this is needed: a PTY merges stdout+stderr onto a single stream by
   * design — the master fd cannot distinguish between them. For
   * experiment-run we want both: live stdout (so the user sees the run
   * in real time) and a clean stderr record on disk (so the run record
   * in runs.jsonl is honest about what the command emitted to fd 2).
   *
   * PTY-internal noise (bash syntax errors, etc.) still appears on stdout
   * because bash's own stderr is not redirected — only the wrapped
   * subshell's stderr is captured. This is acceptable for the experiment
   * use case where the model writes the command.
   */
  captureStderr?: string;
}

export interface RunAiCommandResult {
  output: string;
  exitCode: number;
  cwd: string;
  /** Captured stderr from `captureStderr` file, or `""` if not requested. */
  stderr?: string;
}

interface ActiveRun {
  sessionId: string;
  chatTabId: string;
  requestId: string;
  pty: IPty;
  /** Force-settle the runAiCommand promise if onExit never fires after kill (Bug #15). */
  armForceSettle: () => void;
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
  killAiPtyProcess(active);
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
  const { command, cwd, sessionId, chatTabId, requestId, onChunk, envExtra, captureStderr } = args;
  const trimmed = command.trim();
  if (!trimmed) {
    const message = "Prism AI bash: empty command";
    onChunk(message);
    return Promise.resolve({ output: message, exitCode: 1, cwd });
  }

  cancelAiCommandForSession(sessionId);

  // When stderr capture is requested, wrap the command in a subshell so the
  // *command's* stderr is redirected to a file while its stdout still flows
  // through the PTY for live streaming. Without the subshell, `2>$file`
  // would apply to bash itself, which we don't want.
  const wrappedCommand = captureStderr
    ? `{ ${trimmed}; } 2>${quoteForDoubleQuotedShellPath(captureStderr)}`
    : trimmed;

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let forceSettleTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      if (forceSettleTimer) {
        clearTimeout(forceSettleTimer);
        forceSettleTimer = undefined;
      }
      activeBySession.delete(sessionId);
      // Read captured stderr after the PTY exits; if the file is missing
      // (e.g. the user killed bash before redirect could fire) we fall back
      // to "" rather than throwing.
      let stderr = "";
      if (captureStderr) {
        try {
          // Lazy-import to avoid pulling fs into the PTY hot path when
          // capture isn't used.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require("node:fs") as typeof import("node:fs");
          if (fs.existsSync(captureStderr)) {
            stderr = fs.readFileSync(captureStderr, "utf-8");
            try {
              fs.unlinkSync(captureStderr);
            } catch {
              // best-effort cleanup
            }
          }
        } catch {
          // ignore — caller gets "" stderr
        }
      }
      const result: RunAiCommandResult = { output, exitCode, cwd };
      if (captureStderr) result.stderr = stderr;
      resolve(result);
    };

    const armForceSettle = () => {
      if (settled || forceSettleTimer) return;
      // After kill, if onExit never arrives, still settle so bash-runner
      // inFlight / experiment append paths cannot leak forever (Bug #15).
      forceSettleTimer = setTimeout(() => finish(130), 2_000);
    };

    let ptyProcess: IPty;
    try {
      ptyProcess = pty.spawn(shellBinary(), shellArgs(wrappedCommand), {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          ...envExtra,
        } as { [key: string]: string },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onChunk(message);
      finish(1);
      return;
    }

    activeBySession.set(sessionId, {
      sessionId,
      chatTabId,
      requestId,
      pty: ptyProcess,
      armForceSettle,
    });

    ptyProcess.onData((data) => {
      output += data;
      onChunk(data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      finish(exitCode ?? 1);
    });
  });
}

/**
 * Quote a file path for embedding inside a double-quoted shell string.
 * Wraps in single quotes and escapes any embedded single quotes. Used by
 * the stderr-capture wrapping to keep paths with spaces / shell-meta
 * characters safe.
 */
function quoteForDoubleQuotedShellPath(p: string): string {
  // We embed inside double quotes; the only chars that need escaping are
  // `"`, `\`, and `$`. But for absolute safety we just single-quote
  // and re-double-quote (single-quoted inside double-quoted is a no-op
  // since we never actually need the double quotes for the redirect).
  return `'${p.replace(/'/g, "'\\''")}'`;
}

/**
 * Kill a PTY: Unix process-group SIGTERM (Bug #6) then always `pty.kill()`.
 * Also arm a force-settle so hang kills cannot leave the Promise pending (Bug #15).
 */
function killAiPtyProcess(active: ActiveRun): void {
  const pid = active.pty.pid;
  if (process.platform !== "win32" && typeof pid === "number" && pid > 0) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Fall through to node-pty kill (group signal needs process-group leader).
    }
  }
  try {
    active.pty.kill();
  } catch {
    // ignore
  }
  active.armForceSettle();
}

/** Kill every in-flight AI PTY (app quit / window teardown). */
export function destroyAllAiPty(): void {
  for (const active of activeBySession.values()) {
    killAiPtyProcess(active);
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

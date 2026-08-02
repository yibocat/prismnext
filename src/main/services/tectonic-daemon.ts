/**
 * Persistent Tectonic compile session per build directory.
 *
 * Spawns one long-lived worker (Node via ELECTRON_RUN_AS_NODE) that loops
 * `tectonic` invocations via stdin (FAST / FULL / QUIT).
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { createLogger } from "./logger";

const log = createLogger("tectonic-daemon", "compile");

/** Idle TTL before tearing down a session (ms). */
const IDLE_DISPOSE_MS = 5 * 60 * 1000;
const COMPILE_TIMEOUT_MS = 60_000;

interface Waiter {
  fast: boolean;
  resolve: (result: { exitCode: number }) => void;
  reject: (error: Error) => void;
}

function makeSupersededError(): Error {
  const err = new Error("Compile superseded by newer request");
  (err as Error & { code?: string }).code = "SUPERSEDED";
  return err;
}

function resolveDaemonWorkerPath(): string {
  const candidates = [
    join(__dirname, "tectonic-daemon-worker.mjs"),
    join(app.getAppPath(), "out/main/tectonic-daemon-worker.mjs"),
    join(app.getAppPath(), "src/main/services/tectonic-daemon-worker.mjs"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "tectonic-daemon-worker.mjs not found (checked out/main and src/main/services)",
  );
}

export class TectonicDaemonSession {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private lineBuffer = "";
  private busy = false;
  private waiter: Waiter | null = null;
  private compileTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly tectonicPath: string,
    private readonly buildDir: string,
    private readonly mainFile: string,
  ) {}

  async compile(fast: boolean): Promise<{ exitCode: number }> {
    this.resetIdleTimer();
    this.ensureProcess();

    return new Promise((resolve, reject) => {
      if (this.waiter) {
        this.waiter.reject(makeSupersededError());
      }
      this.waiter = { fast, resolve, reject };
      this.pump();
    });
  }

  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.clearCompileTimer();
    if (this.waiter) {
      this.waiter.reject(new Error("Tectonic daemon disposed"));
      this.waiter = null;
    }
    if (this.proc?.stdin.writable) {
      try {
        this.proc.stdin.write("QUIT\n");
      } catch {
        // ignore
      }
    }
    this.proc?.kill();
    this.proc = null;
    this.busy = false;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_DISPOSE_MS);
  }

  private clearCompileTimer(): void {
    if (this.compileTimer) {
      clearTimeout(this.compileTimer);
      this.compileTimer = null;
    }
  }

  private ensureProcess(): void {
    if (this.proc && !this.proc.killed) return;

    const workerPath = resolveDaemonWorkerPath();
    this.proc = spawn(process.execPath, [workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.buildDir,
      windowsHide: true,
      env: {
        ...process.env,
        // Required: otherwise Electron treats workerPath as an app bundle path.
        ELECTRON_RUN_AS_NODE: "1",
        PRISM_TECTONIC_PATH: this.tectonicPath,
        PRISM_BUILD_DIR: this.buildDir,
        PRISM_MAIN_FILE: this.mainFile,
      },
    });

    this.lineBuffer = "";
    this.busy = false;

    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.onStdout(chunk.toString());
    });
    this.proc.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) log.warn("daemon worker stderr", { msg: msg.slice(0, 200) });
    });
    this.proc.on("close", (code) => {
      log.info("daemon worker exited", { code });
      this.proc = null;
      this.busy = false;
      this.clearCompileTimer();
      if (this.waiter) {
        this.waiter.reject(new Error("Tectonic daemon exited unexpectedly"));
        this.waiter = null;
      }
    });
    this.proc.on("error", (err) => {
      log.warn("daemon worker error", { error: err.message });
      this.proc = null;
      this.busy = false;
      this.clearCompileTimer();
      if (this.waiter) {
        this.waiter.reject(err);
        this.waiter = null;
      }
    });
  }

  private onStdout(chunk: string): void {
    this.lineBuffer += chunk;
    let idx: number;
    while ((idx = this.lineBuffer.indexOf("\n")) >= 0) {
      const line = this.lineBuffer.slice(0, idx).trim();
      this.lineBuffer = this.lineBuffer.slice(idx + 1);
      if (!line.startsWith("DONE:")) continue;

      const exitCode = Number(line.slice(5));
      this.busy = false;
      this.clearCompileTimer();

      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w.resolve({ exitCode: Number.isFinite(exitCode) ? exitCode : 1 });
      }
      this.pump();
    }
  }

  private pump(): void {
    if (this.busy || !this.waiter || !this.proc?.stdin.writable) return;

    const job = this.waiter;
    this.busy = true;
    const cmd = job.fast ? "FAST\n" : "FULL\n";

    this.compileTimer = setTimeout(() => {
      this.busy = false;
      if (this.waiter === job) {
        this.waiter.reject(new Error("Tectonic compile timed out"));
        this.waiter = null;
      }
      this.pump();
    }, COMPILE_TIMEOUT_MS);

    try {
      this.proc.stdin.write(cmd, (err) => {
        if (!err) return;
        this.clearCompileTimer();
        this.busy = false;
        if (this.waiter === job) {
          this.waiter.reject(err);
          this.waiter = null;
        }
        this.pump();
      });
    } catch (err) {
      this.clearCompileTimer();
      this.busy = false;
      if (this.waiter === job) {
        this.waiter.reject(err instanceof Error ? err : new Error(String(err)));
        this.waiter = null;
      }
      this.pump();
    }
  }
}

function sessionKey(buildDir: string, mainFile: string): string {
  return `${buildDir}::${mainFile}`;
}

const sessions = new Map<string, TectonicDaemonSession>();

export function getTectonicDaemonSession(
  tectonicPath: string,
  buildDir: string,
  mainFile: string,
): TectonicDaemonSession {
  const key = sessionKey(buildDir, mainFile);
  let session = sessions.get(key);
  if (!session) {
    session = new TectonicDaemonSession(tectonicPath, buildDir, mainFile);
    sessions.set(key, session);
    log.info("daemon session started", { buildDir, mainFile });
  }
  return session;
}

export function disposeAllTectonicDaemonSessions(): void {
  for (const session of sessions.values()) {
    session.dispose();
  }
  sessions.clear();
}

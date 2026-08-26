import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionTransport } from "../terminal/execution-registry";
import { resolveWorkbenchHome } from "../workbench/home";
import { HOME_JOBS_DIRNAME } from "../../shared/workbench/paths";

export interface DetachedJobMeta {
  executionId: string;
  command: string;
  cwd: string;
  projectId: string;
  experimentId?: string;
  runId?: string;
  startedAt: number;
  pid: number;
}

export interface DetachedJobAttach {
  meta: DetachedJobMeta;
  running: boolean;
  exitCode: number | null;
  tail: string;
  size: number;
}

export function detachedJobsRoot(home = resolveWorkbenchHome()): string {
  return join(home, HOME_JOBS_DIRNAME);
}

export function detachedJobDir(executionId: string, home = resolveWorkbenchHome()): string {
  return join(detachedJobsRoot(home), executionId);
}

function pidPath(dir: string): string {
  return join(dir, "worker.pid");
}

function metaPath(dir: string): string {
  return join(dir, "worker.json");
}

function logPath(dir: string): string {
  return join(dir, "worker.log");
}

function resultPath(dir: string): string {
  return join(dir, "worker-result.json");
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readMeta(dir: string): DetachedJobMeta | null {
  try {
    const parsed = JSON.parse(readFileSync(metaPath(dir), "utf8")) as DetachedJobMeta;
    if (!parsed?.executionId || !parsed.command) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readResult(dir: string): { exitCode: number; endedAt: number } | null {
  try {
    const parsed = JSON.parse(readFileSync(resultPath(dir), "utf8")) as { exitCode?: number; endedAt?: number };
    if (typeof parsed.exitCode !== "number") return null;
    return { exitCode: parsed.exitCode, endedAt: parsed.endedAt ?? Date.now() };
  } catch {
    return null;
  }
}

export function startDetachedJob(input: {
  executionId: string;
  command: string;
  cwd: string;
  projectId: string;
  experimentId?: string;
  runId?: string;
  home?: string;
}): DetachedJobMeta {
  const dir = detachedJobDir(input.executionId, input.home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(logPath(dir), "", "utf8");
  const worker = `
const { spawn } = require("node:child_process");
const { appendFileSync, writeFileSync } = require("node:fs");
const dir = process.argv[1];
const cwd = process.argv[2];
const command = process.argv[3];
const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
writeFileSync(dir + "/worker-child.pid", String(child.pid || ""), "utf8");
const onChunk = (buf) => { try { appendFileSync(dir + "/worker.log", buf); } catch {} };
child.stdout.on("data", onChunk);
child.stderr.on("data", onChunk);
child.on("exit", (code) => {
  writeFileSync(dir + "/worker-result.json", JSON.stringify({
    exitCode: code ?? 1,
    endedAt: Date.now(),
  }));
});
`;
  const child = spawn(process.execPath, ["-e", worker, dir, input.cwd, input.command], {
    detached: true,
    stdio: "ignore",
    cwd: input.cwd,
  });
  if (!child.pid) throw new Error("failed_to_spawn_detached_job");
  child.unref();
  const meta: DetachedJobMeta = {
    executionId: input.executionId,
    command: input.command,
    cwd: input.cwd,
    projectId: input.projectId,
    experimentId: input.experimentId,
    runId: input.runId,
    startedAt: Date.now(),
    pid: child.pid,
  };
  writeFileSync(metaPath(dir), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  writeFileSync(pidPath(dir), `${child.pid}\n`, "utf8");
  return meta;
}

export function attachDetachedJob(
  executionId: string,
  fromByte = 0,
  home = resolveWorkbenchHome(),
): DetachedJobAttach | null {
  const dir = detachedJobDir(executionId, home);
  const meta = readMeta(dir);
  if (!meta) return null;
  const result = readResult(dir);
  const running = !result && isPidAlive(meta.pid);
  let tail = "";
  let size = 0;
  try {
    const buf = readFileSync(logPath(dir));
    size = buf.byteLength;
    tail = buf.subarray(Math.max(0, fromByte)).toString("utf8");
  } catch {
    // empty
  }
  return {
    meta,
    running,
    exitCode: result?.exitCode ?? null,
    tail,
    size,
  };
}

export function listDetachedJobs(home = resolveWorkbenchHome()): DetachedJobAttach[] {
  const root = detachedJobsRoot(home);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((id) => attachDetachedJob(id, 0, home))
    .filter((item): item is DetachedJobAttach => Boolean(item));
}

export function cancelDetachedJob(executionId: string, home = resolveWorkbenchHome()): boolean {
  const dir = detachedJobDir(executionId, home);
  const meta = readMeta(dir);
  if (!meta) return false;
  let killed = false;
  try {
    const childPid = Number(readFileSync(join(dir, "worker-child.pid"), "utf8").trim());
    if (isPidAlive(childPid)) {
      process.kill(childPid, "SIGTERM");
      killed = true;
    }
  } catch {
    // no child pid yet
  }
  if (isPidAlive(meta.pid)) {
    process.kill(meta.pid, "SIGTERM");
    killed = true;
  }
  return killed;
}

export function removeDetachedJobPidFile(executionId: string, home = resolveWorkbenchHome()): void {
  try {
    unlinkSync(pidPath(detachedJobDir(executionId, home)));
  } catch {
    // ignore
  }
}

export function createDetachedExecutionTransport(home?: string): ExecutionTransport {
  const lastByte = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  function stopPoll(executionId: string): void {
    const timer = timers.get(executionId);
    if (timer) clearInterval(timer);
    timers.delete(executionId);
  }

  function poll(executionId: string, handlers: { onOutput(data: string): void; onExit(exitCode: number): void }): void {
    const tick = () => {
      const view = attachDetachedJob(executionId, lastByte.get(executionId) ?? 0, home);
      if (!view) return;
      if (view.tail) handlers.onOutput(view.tail);
      lastByte.set(executionId, view.size);
      if (!view.running && view.exitCode !== null) {
        stopPoll(executionId);
        handlers.onExit(view.exitCode);
      }
    };
    stopPoll(executionId);
    timers.set(executionId, setInterval(tick, 300));
    tick();
  }

  return {
    async start(execution, handlers) {
      const existing = attachDetachedJob(execution.executionId, 0, home);
      if (!existing?.running) {
        startDetachedJob({
          executionId: execution.executionId,
          command: execution.command,
          cwd: execution.cwd,
          projectId: execution.projectId,
          experimentId: execution.experimentId,
          runId: execution.runId,
          home,
        });
      }
      poll(execution.executionId, handlers);
    },
    async cancel(executionId) {
      stopPoll(executionId);
      cancelDetachedJob(executionId, home);
    },
  };
}

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { createLogger, shortLogDetail } from "../app/logger";

const log = createLogger("git", "git");

let _pending: Promise<unknown> = Promise.resolve();
const _warmedUpRoots = new Set<string>();

export const GIT_TIMEOUT_MS = 30_000;

export function enqueueGitTask<T>(run: () => Promise<T>): Promise<T> {
  const task = _pending.then(run, run);
  _pending = task.catch(() => {}).then(() => {});
  return task;
}

/** Queue a warmup as the next task in the serial queue and return a
 *  promise that resolves when it completes. Callers may fire-and-forget —
 *  subsequent git operations auto-queue behind it via the serial _pending chain.
 *
 *  Idempotent per project root: repeated calls for the same root return
 *  immediately (the TCC / security check is per-process, not per directory). */
export function queueWarmup(projectRoot: string): Promise<void> {
  if (_warmedUpRoots.has(projectRoot)) return Promise.resolve();

  const start = performance.now();
  // touch+rm warms the read/write TCC path for new files.
  // Git-specific warmup runs ONLY when a repo exists — appending to .gitignore
  // on a non-git project would leave a stray root .gitignore behind.
  const hasGit = existsSync(join(projectRoot, ".git"));
  const cmdParts = [
    `cd ${JSON.stringify(projectRoot)}`,
    `touch .prism_warmup && rm .prism_warmup`,
  ];
  if (hasGit) {
    const gitignorePath = join(projectRoot, ".gitignore");
    if (existsSync(gitignorePath)) {
      cmdParts.push(`echo "warmup" >> .gitignore && git checkout -- .gitignore`);
    }
    cmdParts.push(
      `git status --porcelain -b >/dev/null`,
      `git branch --list >/dev/null`,
      `git log --oneline -1 >/dev/null`,
      `git update-index --refresh`,
    );
  }
  const cmd = cmdParts.join(" && ");

  const task = _pending.then(() => new Promise<void>((resolve) => {
    // Use spawn with explicit stdio to avoid EBADF in Electron
    const child = spawn("sh", ["-c", cmd], {
      stdio: "ignore",
      timeout: 30000,
    });
    child.on("close", () => {
      const ms = performance.now() - start;
      // warmup timing logged via log.info below
      log.debug("warmup complete", { durationMs: Math.round(ms) });
      _warmedUpRoots.add(projectRoot);
      resolve();
    });
    child.on("error", () => {
      // Warmup failure is non-fatal — resolve anyway
      _warmedUpRoots.add(projectRoot);
      resolve();
    });
  }));
  _pending = task.catch(() => {}).then(() => {});
  return task;
}

function sh(projectRoot: string, gitArgs: string[]): Promise<string> {
  const run = () => new Promise<string>((resolve, reject) => {
    const start = performance.now();
    const child = spawn("git", ["-c", "core.quotepath=false", ...gitArgs], {
      cwd: projectRoot,
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    child.on("close", (code) => {
      const ms = performance.now() - start;
      log.debug(`git ${gitArgs[0]}`, { durationMs: Math.round(ms) });
      if (code !== 0) {
        if (shouldLogGitFail(gitArgs)) {
          log.warn("git.fail", {
            cmd: gitFailCommand(gitArgs),
            exit: code ?? 1,
            stderr: shortLogDetail(stderr.trim() || `git exited with code ${code}`, 300),
            project: basename(projectRoot),
          });
        }
        reject(new Error(stderr.trim() || `git exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
    child.on("error", (err) => {
      if (shouldLogGitFail(gitArgs)) {
        log.warn("git.fail", {
          cmd: gitFailCommand(gitArgs),
          error: shortLogDetail(err),
          project: basename(projectRoot),
        });
      }
      reject(err);
    });
  });
  return enqueueGitTask(run);
}

/** User-facing verbs — probe commands (rev-parse, status, show) stay quiet. */
const GIT_FAIL_LOG_VERBS = new Set([
  "commit",
  "push",
  "pull",
  "fetch",
  "merge",
  "rebase",
  "add",
  "checkout",
  "switch",
  "reset",
  "stash",
  "init",
  "clone",
  "cherry-pick",
  "revert",
]);

export function gitFailCommand(gitArgs: string[]): string {
  if (gitArgs[0] === "worktree" && gitArgs[1]) return `worktree ${gitArgs[1]}`;
  return gitArgs[0] || "git";
}

export function shouldLogGitFail(gitArgs: string[]): boolean {
  const verb = gitArgs[0];
  if (verb === "worktree") return gitArgs[1] === "add" || gitArgs[1] === "remove";
  return GIT_FAIL_LOG_VERBS.has(verb ?? "");
}

// ─── Core: execute git commands ───

export function execGit(projectRoot: string, args: string[]): Promise<string> {
  return sh(projectRoot, args);
}

export function execGitOrNull(projectRoot: string, args: string[]): Promise<string | null> {
  return execGit(projectRoot, args).catch(() => null);
}

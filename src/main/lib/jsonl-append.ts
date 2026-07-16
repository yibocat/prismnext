/**
 * Locked JSONL append — exclusive lock file + sync append + fsync.
 *
 * Used by experiment `runs.jsonl` and project `.prismnext/provenance.jsonl`
 * so concurrent Agent / UI writers do not interleave mid-line. Single-line
 * POSIX appends are usually atomic for small writes; the lock serializes
 * Prism Next writers (bridge poll + IPC). `fsync` reduces the power-loss window.
 *
 * Lock model: `path + ".lock"` with `O_EXCL` (wx) — already cross-process
 * among Prism Next writers (no native flock; Node has none without addons).
 * Stale locks from crashes are broken when mtime is older than
 * {@link LOCK_STALE_MS} (Bug #38 hardening).
 */
import * as fs from "node:fs";
import { dirname } from "node:path";

const LOCK_RETRY_MS = 20;
const LOCK_MAX_WAIT_MS = 5_000;
/** Break abandoned `.lock` files left by a crashed process (Bug #38). */
export const LOCK_STALE_MS = 10_000;

function sleepSync(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

function tryBreakStaleLock(lockPath: string): void {
  try {
    const st = fs.statSync(lockPath);
    if (Date.now() - st.mtimeMs < LOCK_STALE_MS) return;
    fs.unlinkSync(lockPath);
  } catch {
    // gone / racing — ignore
  }
}

/** Run `fn` while holding an exclusive lock file beside `targetPath`. */
export function withJsonlLock(targetPath: string, fn: () => void): void {
  const lockPath = `${targetPath}.lock`;
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  for (;;) {
    let fd: number | null = null;
    try {
      fd = fs.openSync(lockPath, "wx");
      try {
        fn();
      } finally {
        fs.closeSync(fd);
        fd = null;
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Another process may have cleaned up; ignore.
        }
      }
      return;
    } catch (err) {
      if (fd != null) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
      }
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST") throw err;
      // Crash-orphaned locks older than LOCK_STALE_MS are unlinked here.
      tryBreakStaleLock(lockPath);
      if (Date.now() >= deadline) {
        throw new Error(`jsonl lock timeout: ${lockPath}`);
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

/** Ensure parent dir exists, lock, append one JSON line + newline, fsync. */
export function appendJsonlLine(filePath: string, value: unknown): void {
  const line = `${JSON.stringify(value)}\n`;
  fs.mkdirSync(dirname(filePath), { recursive: true });
  withJsonlLock(filePath, () => {
    const fd = fs.openSync(filePath, "a");
    try {
      fs.writeSync(fd, line, undefined, "utf-8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  });
}

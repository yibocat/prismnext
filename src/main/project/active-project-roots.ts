/**
 * Active project-root registry — the main-process-side trust anchor for fs IPC
 * path containment.
 *
 * Problem: {@link ../../ipc/fs.ts} fs IPC handlers historically accepted
 * arbitrary `absPath` from the renderer, so a compromised renderer could
 * read/write/delete ANY file on the system. There is no global main-side
 * source of truth for "which project is open" — every handler receives
 * `rootPath` from the renderer — so we maintain one here, populated when the
 * renderer opens a project (`fs:scan` / `fs:watch-start`).
 *
 * Trust model (v1):
 * - A project root may only be registered if it is absolute, non-system, and
 *   under `os.homedir()`. This blocks `/`, `/etc`, `/System`, … even if a
 *   compromised renderer tries to register them.
 * - Residual risk: a compromised renderer can still register any homedir
 *   subdir. CSP (renderer hardening) is the primary defense; this registry is
 *   defense-in-depth that turns "any file on the system" into "any file under
 *   the user's home, and mutations only under the open project".
 * - Workspace folders are relative single-level names (see WorkspaceFolder),
 *   so they live under the project root and need no separate registration.
 *
 * Mutations (write/delete/deleteFolder/rename/mkdir) require `isPathContained`
 * (within a registered root). Reads (read/readBatch/readImage/exists/isFile)
 * use the looser `isPathUnderHome` (any homedir path, still blocking system
 * dirs) so the agent/editor can read reference files outside the project
 * without exfiltrating `/etc/passwd`.
 */
import { resolve, relative, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../app/logger";

const log = createLogger("active-roots", "security");

const _roots = new Set<string>();
const HOME = homedir();

// System directories that must never be treated as a project root. Listed
// explicitly (rather than "anything not under home") so the rejection reason
// is legible in logs and so future home-dir-relative system paths are caught.
const SYSTEM_PREFIXES = [
  "/System", "/usr", "/bin", "/sbin", "/etc", "/var", "/dev",
  "/proc", "/sys", "/private/etc", "/lib", "/lib64", "/opt", "/boot",
];

function isSystemPath(r: string): boolean {
  for (const p of SYSTEM_PREFIXES) {
    if (r === p || r.startsWith(p + "/")) return true;
  }
  return false;
}

/** A path is a registerable project root iff absolute, non-system, under home. */
function isSafeRoot(abs: string): boolean {
  if (!abs || typeof abs !== "string" || !isAbsolute(abs)) return false;
  const r = resolve(abs);
  if (r === "/" || r === HOME) return false;
  if (isSystemPath(r)) return false;
  if (!r.startsWith(HOME + "/")) return false;
  return true;
}

/** Register the active project root. Returns false (and logs) if rejected. */
export function registerProjectRoot(abs: string): boolean {
  if (!isSafeRoot(abs)) {
    log.warn("rejected project root registration", { abs });
    return false;
  }
  const root = resolve(abs);
  _roots.add(root);
  return true;
}

/** Register additional workspace roots (absolute). Skips unsafe entries. */
export function registerWorkspaceRoots(absList: string[]): void {
  for (const a of absList) {
    if (isSafeRoot(a)) {
      _roots.add(resolve(a));
    } else {
      log.warn("rejected workspace root registration", { abs: a });
    }
  }
}

/** Clear all registered roots (called on project switch / watch-stop). */
export function clearRoots(): void {
  _roots.clear();
}

/** Replace the registry with the given workbench member lastPaths (P4). */
export function replaceRegisteredRoots(absList: readonly string[]): void {
  _roots.clear();
  for (const abs of absList) {
    registerProjectRoot(abs);
  }
}

/** True if `absPath` is equal to or nested under a registered project root. */
export function isPathContained(abs: string): boolean {
  if (!abs || typeof abs !== "string" || !isAbsolute(abs)) return false;
  const r = resolve(abs);
  for (const root of _roots) {
    if (r === root) return true;
    const rel = relative(root, r);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return true;
  }
  return false;
}

/** True when `abs` is exactly a registered, active project root. */
export function isRegisteredProjectRoot(abs: string): boolean {
  return Boolean(abs && typeof abs === "string" && isAbsolute(abs) && _roots.has(resolve(abs)));
}

/**
 * True if `absPath` is under the user's home directory and not a system path.
 * Looser than {@link isPathContained} — used for reads and user-dialog
 * export/import, which may legitimately target homedir paths outside the
 * project (e.g. ~/Downloads) but must still never touch system files.
 */
export function isPathUnderHome(abs: string): boolean {
  if (!abs || typeof abs !== "string" || !isAbsolute(abs)) return false;
  const r = resolve(abs);
  if (isSystemPath(r)) return false;
  return r.startsWith(HOME + "/");
}

/** Assert a mutation target is contained, else throw a descriptive error. */
export function assertContained(abs: string, op: string): void {
  if (!isPathContained(abs)) {
    throw new Error(
      `Path outside project boundaries (${op}): ${abs}. ` +
        `Open a project first, or the path must be within the active project root.`,
    );
  }
}

/** Assert a read / dialog target is under home, else throw. */
export function assertUnderHome(abs: string, op: string): void {
  if (!isPathUnderHome(abs)) {
    throw new Error(`Path outside user home (${op}): ${abs}`);
  }
}

/** Public accessor: returns the currently registered project roots.
 *  Used by pro-teams-discovery to broadcast license-change invalidation. */
export function _registeredRoots(): string[] {
  return Array.from(_roots).sort();
}

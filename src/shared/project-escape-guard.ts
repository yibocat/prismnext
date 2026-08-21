/**
 * Project-escape guard — hard gates against agents reaching outside the
 * project workspace to fetch content (e.g. reconstructing an uninstalled
 * skill from a source checkout found via Spotlight).
 *
 * Two layers:
 * - Whole-disk search commands (mdfind / locate): hard deny + execution
 *   block, like the latex-compile gate. In-project search uses grep/glob.
 * - File-access verbs carrying path arguments that resolve outside the
 *   project root: surfaced to the smart permission policy as "prompt"
 *   (user may approve once or allow-always; Settings → Permissions →
 *   Allowed paths is the standing exception). Enabled skill folders are
 *   a host-owned read exception (`skillReadRoots`) — ls/cat/find there
 *   is not project-escape. Writes into those folders are still outside.
 */

import {
  isAbsoluteFsPath,
  isPathNestedInside,
  normalizeAbsPath,
  normalizeFsSeparators,
  resolveFsPath,
} from "./fs-path";
import { isPathUnderSkillReadRoots, isSkillReadBashVerb } from "./skill-read-roots";

/**
 * Spotlight / locate as a command word (optionally path-qualified / sudo),
 * including after `&&`, `;`, `|`, or newlines. Does not match `which mdfind`.
 */
const WHOLE_DISK_SEARCH_RE = new RegExp(
  `(?:^|[;&|\\n]|&&|\\|\\|)\\s*(?:sudo\\s+)?(?:\\S*\\/)?(?:mdfind|locate)(?=\\s|$)`,
  "i",
);

export function isWholeDiskSearchBashCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  return WHOLE_DISK_SEARCH_RE.test(c);
}

/** Tool-result / PTY gate message (same turn). */
export function wholeDiskSearchBlockMessage(): string {
  return (
    "prismnext: whole-disk search (mdfind / locate) is not available to agents. " +
    "Search inside the project with the grep/glob tools instead. " +
    "If you need content from a specific folder outside the project, ask the user to add it " +
    "under Settings → Permissions → Allowed paths, then read from there."
  );
}

/** Injected on the next chat:send after ACP denies (permission reject has no reason string). */
export function wholeDiskSearchRedirectNote(): string {
  return (
    "A bash whole-disk search (mdfind/locate) was blocked. Use grep/glob within the project — " +
    "for an outside folder, ask the user to allow it in Settings → Permissions → Allowed paths."
  );
}

/**
 * Verbs whose path arguments pull file content/metadata into the run.
 * Executables in command position are never checked — only arguments.
 */
const FILE_ACCESS_VERBS = new Set([
  "cat", "head", "tail", "less", "more",
  "grep", "egrep", "fgrep", "rg",
  "sed", "awk", "find", "ls", "tree",
  "stat", "file", "du", "wc", "diff",
  "cp", "mv", "rsync", "tar", "zip", "unzip",
  "xxd", "strings", "plutil", "sqlite3", "source",
]);

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const ENV_ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

function splitShellSegments(command: string): string[] {
  return command.split(/&&|\|\||[;|\n]/);
}

function tokenize(segment: string): string[] {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function unquote(token: string): string {
  const t = token.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

function verbBasename(token: string): string {
  const t = unquote(token);
  const slash = t.lastIndexOf("/");
  return (slash >= 0 ? t.slice(slash + 1) : t).toLowerCase();
}

function homeDirOrEmpty(homeDir?: string | null): string {
  if (homeDir?.trim()) return normalizeAbsPath(homeDir.trim());
  // Shared layer has no node types — reach env via globalThis so the same
  // module type-checks and runs in both main and renderer.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const home = proc?.env?.HOME || proc?.env?.USERPROFILE || "";
  return home ? normalizeAbsPath(home) : "";
}

/**
 * Path-like arguments of file-access verbs that resolve OUTSIDE `projectRoot`.
 * Catches: absolute paths, `~` / `$HOME` paths, and relative paths whose
 * resolution escapes the project (`../../sibling-repo/x`), and bare filenames
 * when the (cd-chained) cwd is itself outside the project. URLs and flags are
 * ignored; paths under `opts.allowedPaths` (the user's standing
 * outside-project allowances) are exempt.
 * Detection-only — the policy layer decides prompt vs allow.
 * `skillReadRoots` exempts read-only verbs (ls/cat/find/…) only.
 */
export function extractOutsideProjectPathArgs(
  command: string,
  cwd: string | null | undefined,
  projectRoot: string | null | undefined,
  opts?: {
    homeDir?: string | null;
    allowedPaths?: string[] | null;
    skillReadRoots?: string[] | null;
  },
): string[] {
  const root = projectRoot?.trim() ? normalizeAbsPath(projectRoot.trim()) : "";
  if (!root || !command.trim()) return [];
  const base = cwd?.trim() ? resolveFsPath(cwd.trim()) : root;
  let curBase = base;
  const home = homeDirOrEmpty(opts?.homeDir);
  const allowed = (opts?.allowedPaths ?? [])
    .filter((p): p is string => typeof p === "string" && !!p.trim())
    .map((p) => normalizeAbsPath(p.trim()));
  const skillRoots = (opts?.skillReadRoots ?? [])
    .filter((p): p is string => typeof p === "string" && !!p.trim())
    .map((p) => normalizeAbsPath(p.trim()));

  const offenders: string[] = [];
  const seen = new Set<string>();

  const check = (rawToken: string, resolveBase: string, verb: string): void => {
    let token = unquote(rawToken);
    if (!token || URL_SCHEME_RE.test(token)) return;
    // --opt=value / -o=value: inspect the value side.
    if (token.startsWith("-")) {
      const eq = token.indexOf("=");
      if (eq < 0) return;
      token = token.slice(eq + 1);
      if (!token || URL_SCHEME_RE.test(token)) return;
    }
    let resolved: string;
    if (token === "~" || token.startsWith("~/") || token === "$HOME" || token.startsWith("$HOME/")) {
      if (!home) return; // unknown home → cannot decide; do not flag
      const rest = token.replace(/^~|^\$HOME/, "").replace(/^\/+/, "");
      resolved = resolveFsPath(home, rest);
    } else if (isAbsoluteFsPath(token)) {
      resolved = resolveFsPath(token);
    } else if (normalizeFsSeparators(token).includes("/")) {
      resolved = resolveFsPath(resolveBase, token);
    } else {
      // Bare filename: only suspicious when the (possibly cd-chained) cwd
      // is itself outside the project.
      if (isPathNestedInside(root, resolveBase)) return;
      resolved = resolveFsPath(resolveBase, token);
    }
    if (isPathNestedInside(root, resolved)) return;
    if (allowed.some((ap) => isPathNestedInside(ap, resolved))) return;
    if (isPathUnderSkillReadRoots(resolved, skillRoots) && isSkillReadBashVerb(verb)) return;
    if (!seen.has(resolved)) {
      seen.add(resolved);
      offenders.push(token);
    }
  };

  for (const segment of splitShellSegments(command)) {
    const tokens = tokenize(segment);
    if (!tokens.length) continue;
    let i = 0;
    // Skip env assignments and command wrappers to find the verb.
    while (i < tokens.length && tokens[i] && ENV_ASSIGN_RE.test(unquote(tokens[i]!))) i++;
    while (i < tokens.length && ["sudo", "command", "env"].includes(verbBasename(tokens[i]!))) {
      i++;
      while (i < tokens.length && tokens[i] && ENV_ASSIGN_RE.test(unquote(tokens[i]!))) i++;
    }
    const verbToken = tokens[i];
    if (!verbToken) continue;
    const verb = verbBasename(verbToken);
    // Track `cd` so a later `cat x.md` resolves against the chained cwd —
    // otherwise `cd /outside && cat x.md` would slip through with bare names.
    if (verb === "cd") {
      const target = tokens.slice(i + 1).find((t) => !unquote(t).startsWith("-"));
      const arg = target ? unquote(target) : "";
      if (!arg || arg === "-") continue;
      if (arg === "~" || arg.startsWith("~/")) {
        if (home) curBase = resolveFsPath(home, arg.slice(1).replace(/^\/+/, ""));
      } else if (isAbsoluteFsPath(arg)) {
        curBase = resolveFsPath(arg);
      } else {
        curBase = resolveFsPath(curBase, arg);
      }
      continue;
    }
    if (!FILE_ACCESS_VERBS.has(verb)) continue;
    for (const arg of tokens.slice(i + 1)) check(arg, curBase, verb);
  }

  return offenders;
}

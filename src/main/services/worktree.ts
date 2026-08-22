import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { execGit } from "./git";
import { createLogger, shortLogDetail } from "./logger";
import {
  homeWorktreeCheckoutDir,
  homeWorktreeSlotDir,
  parseHomeWorktreeCheckout,
  resolveWorkbenchHome,
} from "../workbench/home";
import { ensureWorkbenchId, readWorkbenchJson } from "../workbench/identity";
import { PROJECTS_DIRNAME, WORKTREES_DIRNAME } from "../../shared/workbench-paths";
import type { BranchInfo, MergeStatus, WorktreeInfo } from "../../shared/git";
export type { BranchInfo, MergeStatus, WorktreeInfo } from "../../shared/git";

const log = createLogger("worktree", "git");

// ─── Constants ───

const BRANCH_PREFIX = "wt-";
const WORKTREE_META_FILENAME = ".prism-worktree-meta";
const WORKTREE_SLOT_META_FILENAME = "meta.json";

function normalizeWorktreePath(worktreePath: string): string {
  return resolve(worktreePath);
}

const ADJECTIVES = [
  "amber", "azure", "bold", "brave", "bright", "calm", "clear", "cool",
  "coral", "crisp", "deep", "eager", "fair", "fast", "fresh", "gentle",
  "golden", "grand", "green", "happy", "keen", "kind", "light", "lively",
  "lucky", "mellow", "merry", "mild", "mint", "noble", "pale", "proud",
  "quick", "quiet", "rapid", "rich", "sharp", "shy", "sleek", "smart",
  "soft", "solid", "steady", "still", "sunny", "super", "sure", "sweet",
  "swift", "tall", "teal", "tidy", "true", "vivid", "warm", "wild",
  "wise", "young", "zesty",
];

const NOUNS = [
  "ant", "auk", "bat", "bear", "bee", "bird", "boar", "buck",
  "bull", "cat", "clam", "cod", "crab", "crow", "deer", "dog",
  "dove", "duck", "eel", "elk", "emu", "finch", "fish", "fly",
  "fox", "frog", "goat", "grub", "gull", "hare", "hawk", "heron",
  "ibis", "jay", "kite", "kiwi", "koi", "lark", "lion", "lynx",
  "mink", "mole", "moth", "mouse", "newt", "orca", "otter", "owl",
  "panda", "perch", "pike", "pony", "puma", "quail", "ray", "robin",
  "seal", "shark", "sheep", "slug", "snail", "snipe", "sole", "stag",
  "swan", "teal", "tern", "toad", "trout", "vole", "wasp", "whale",
  "wolf", "worm", "wren", "yak",
];

function generateWorktreeName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

/** @internal Exported for unit tests */
export function generateWorktreeNameForTest(): string {
  return generateWorktreeName();
}

function assertWorktreeName(name: string): string {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid worktree name: ${name || "(empty)"}`);
  }
  return name;
}

function projectIdForWorktrees(projectRoot: string): string | null {
  return readWorkbenchJson(projectRoot)?.id ?? null;
}

function worktreeCheckoutPath(projectId: string, name: string): string {
  return homeWorktreeCheckoutDir(projectId, name);
}

function worktreeSlotPath(projectId: string, name: string): string {
  return homeWorktreeSlotDir(projectId, name);
}

function homeWorktreesDir(projectId: string): string {
  return join(resolveWorkbenchHome(), PROJECTS_DIRNAME, projectId, WORKTREES_DIRNAME);
}

/** Pick a random adjective-noun name not already used in the home worktree slot. */
function generateUniqueWorktreeName(projectId: string, maxAttempts = 64): string {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateWorktreeName();
    if (!existsSync(worktreeSlotPath(projectId, candidate))) {
      return candidate;
    }
  }
  throw new Error("Could not generate a unique worktree name — try again or remove old worktrees.");
}

function writeWorktreeMeta(projectId: string, name: string, baseBranch: string, branchName: string): void {
  const checkout = worktreeCheckoutPath(projectId, name);
  try {
    writeFileSync(join(checkout, WORKTREE_META_FILENAME), baseBranch, "utf-8");
  } catch {}
  try {
    writeFileSync(
      join(worktreeSlotPath(projectId, name), WORKTREE_SLOT_META_FILENAME),
      `${JSON.stringify({ name, branch: branchName, baseBranch, createdAt: Date.now() }, null, 2)}\n`,
      "utf-8",
    );
  } catch {}
}

/** Return the name of the default main branch (main or master, whichever exists). */
async function detectMainBranch(repoPath: string): Promise<string> {
  for (const name of ["main", "master"]) {
    try { await execGit(repoPath, ["rev-parse", "--verify", name]); return name; } catch {}
  }
  try {
    const ref = await execGit(repoPath, ["symbolic-ref", "--short", "HEAD"]);
    return ref.trim();
  } catch { return "main"; }
}

/** Return the currently checked-out branch name (detached HEAD → empty string). */
async function getCurrentBranch(repoPath: string): Promise<string> {
  try {
    const ref = await execGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return ref.trim() === "HEAD" ? "" : ref.trim();
  } catch {
    return "";
  }
}

// ─── Public API ───

export async function createWorktree(
  projectRoot: string,
  name?: string,
  baseBranch?: string,
): Promise<WorktreeInfo> {
  let resolvedName = name || "";
  try {
    if (!existsSync(join(projectRoot, ".git"))) {
      throw new Error(
        "Git repository required. Initialize Git in this project before creating a worktree.",
      );
    }

    const projectId = ensureWorkbenchId(projectRoot);
    resolvedName = name ? assertWorktreeName(name) : generateUniqueWorktreeName(projectId);
    const branchName = `${BRANCH_PREFIX}${resolvedName}`;
    const slotDir = worktreeSlotPath(projectId, resolvedName);
    const worktreePath = worktreeCheckoutPath(projectId, resolvedName);

    if (existsSync(slotDir) || existsSync(worktreePath)) {
      throw new Error(`Worktree "${resolvedName}" already exists`);
    }

    // Ensure at least one commit exists (git worktree add requires it)
    try { await execGit(projectRoot, ["rev-parse", "HEAD"]); } catch {
      // No commits yet — create initial commit with all existing files
      try {
        await execGit(projectRoot, ["add", "-A"]);
        await execGit(projectRoot, ["commit", "-m", "Initial project setup"]);
      } catch {
        // Fallback: empty commit if add fails (e.g. empty directory)
        await execGit(projectRoot, ["commit", "--allow-empty", "-m", "Initial project setup"]);
      }
    }

    // Resolve base branch — default to the currently checked-out branch.
    // Never fall back to detectMainBranch(): that always returns "main"/"master"
    // regardless of which branch the user is actually on.
    const resolvedBase = baseBranch || (await getCurrentBranch(projectRoot)) || (await detectMainBranch(projectRoot));

    // Clean up zombie branch if it exists
    try { await execGit(projectRoot, ["branch", "-D", branchName]); } catch {}

    mkdirSync(slotDir, { recursive: true });
    try {
      await execGit(projectRoot, ["worktree", "add", "-b", branchName, worktreePath, resolvedBase]);
    } catch (err) {
      try { await rm(slotDir, { recursive: true, force: true }); } catch {}
      throw err;
    }

    let head = "";
    try { head = (await execGit(worktreePath, ["rev-parse", "--short", "HEAD"])).trim(); } catch {}

    writeWorktreeMeta(projectId, resolvedName, resolvedBase, branchName);

    return {
      name: resolvedName,
      path: normalizeWorktreePath(worktreePath),
      branch: branchName,
      baseBranch: resolvedBase,
      head,
      aheadCount: 0,
      behindCount: 0,
    };
  } catch (err) {
    log.warn("worktree.fail", {
      op: "create",
      name: resolvedName,
      error: shortLogDetail(err),
      project: basename(projectRoot),
    });
    throw err;
  }
}

export async function removeWorktree(
  projectRoot: string,
  name: string,
): Promise<void> {
  try {
    const resolvedName = assertWorktreeName(name);
    const projectId = projectIdForWorktrees(projectRoot);
    if (!projectId) {
      throw new Error(`Worktree "${resolvedName}" not found`);
    }

    const worktreePath = worktreeCheckoutPath(projectId, resolvedName);
    const slotDir = worktreeSlotPath(projectId, resolvedName);
    const branchName = `${BRANCH_PREFIX}${resolvedName}`;

    const errors: string[] = [];

    // Remove worktree checkout
    if (existsSync(worktreePath)) {
      try {
        await execGit(projectRoot, ["worktree", "remove", "--force", worktreePath]);
      } catch {
        // If git remove fails, delete only this checkout directory — never prune all worktrees.
        try { await rm(worktreePath, { recursive: true, force: true }); } catch {}
        if (existsSync(worktreePath)) {
          errors.push(`Failed to remove worktree directory: ${worktreePath}`);
        }
      }
    }

    if (existsSync(slotDir)) {
      try { await rm(slotDir, { recursive: true, force: true }); } catch {}
    }

    // Delete branch (only if worktree was successfully removed)
    try {
      await execGit(projectRoot, ["branch", "-D", branchName]);
    } catch {
      // Branch may not exist — that's OK if the worktree is gone
      if (!existsSync(worktreePath)) {
        // Worktree removed, branch cleanup is non-critical
      } else {
        errors.push(`Failed to delete branch: ${branchName}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  } catch (err) {
    log.warn("worktree.fail", {
      op: "remove",
      name,
      error: shortLogDetail(err),
      project: basename(projectRoot),
    });
    throw err;
  }
}

function readBaseBranch(checkoutPath: string, fallback: string): string {
  try {
    const meta = readFileSync(join(checkoutPath, WORKTREE_META_FILENAME), "utf-8").trim();
    if (meta) return meta;
  } catch {}
  return fallback;
}

async function countAheadBehind(
  projectRoot: string,
  baseBranch: string,
  branch: string,
): Promise<{ aheadCount: number; behindCount: number }> {
  let aheadCount = 0;
  let behindCount = 0;
  try {
    const count = await execGit(projectRoot, ["rev-list", "--count", `${baseBranch}..${branch}`]);
    aheadCount = parseInt(count.trim(), 10) || 0;
  } catch {}
  try {
    const count = await execGit(projectRoot, ["rev-list", "--count", `${branch}..${baseBranch}`]);
    behindCount = parseInt(count.trim(), 10) || 0;
  } catch {}
  return { aheadCount, behindCount };
}

export async function listWorktrees(projectRoot: string): Promise<WorktreeInfo[]> {
  const projectId = projectIdForWorktrees(projectRoot);
  if (!projectId) return [];

  const worktreesDir = homeWorktreesDir(projectId);

  let output = "";
  try {
    output = await execGit(projectRoot, ["worktree", "list", "--porcelain"]);
  } catch {
    // Fall through to filesystem scan — git list can fail transiently during worktree remove.
  }

  const result: WorktreeInfo[] = [];
  const mainBranch = await detectMainBranch(projectRoot);

  const entries = output.split("\n\n").filter((s) => s.trim());
  for (const entry of entries) {
    const lines = entry.split("\n");
    let worktreePath = "";
    let head = "";
    let branch = "";

    for (const line of lines) {
      if (line.startsWith("worktree ")) worktreePath = line.slice(9);
      if (line.startsWith("HEAD ")) head = line.slice(5);
      if (line.startsWith("branch ")) {
        branch = line.slice(18);
      }
    }

    const parsed = parseHomeWorktreeCheckout(worktreePath);
    if (!parsed || parsed.projectId !== projectId) continue;
    const wtName = parsed.worktreeId;
    if (!existsSync(worktreePath) || !existsSync(join(worktreePath, ".git"))) continue;

    const baseBranch = readBaseBranch(worktreePath, mainBranch);
    const { aheadCount, behindCount } = await countAheadBehind(projectRoot, baseBranch, branch);

    result.push({
      name: wtName,
      path: normalizeWorktreePath(worktreePath),
      branch,
      baseBranch,
      head,
      aheadCount,
      behindCount,
    });
  }

  let dirEntries: { name: string; isDirectory: () => boolean }[];
  try { dirEntries = await readdir(worktreesDir, { withFileTypes: true }); } catch { dirEntries = []; }
  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    if (result.some((r) => r.name === entry.name)) continue;
    const checkout = worktreeCheckoutPath(projectId, entry.name);
    if (!existsSync(join(checkout, ".git"))) continue;
    const baseBranch = readBaseBranch(checkout, mainBranch);
    const branch = `${BRANCH_PREFIX}${entry.name}`;
    const { aheadCount, behindCount } = await countAheadBehind(projectRoot, baseBranch, branch);
    result.push({
      name: entry.name,
      path: normalizeWorktreePath(checkout),
      branch,
      baseBranch,
      head: "",
      aheadCount,
      behindCount,
    });
  }

  return result;
}

export async function getMergeStatus(
  projectRoot: string,
  worktreeName: string,
): Promise<MergeStatus> {
  const branchName = `${BRANCH_PREFIX}${worktreeName}`;

  // Get base branch from the worktree
  let baseBranch: string;
  try {
    const wts = await listWorktrees(projectRoot);
    const wt = wts.find(w => w.name === worktreeName);
    baseBranch = wt?.baseBranch || await detectMainBranch(projectRoot);
  } catch {
    baseBranch = await detectMainBranch(projectRoot);
  }

  let aheadCount = 0;
  let behindCount = 0;
  let commits: { hash: string; message: string }[] = [];

  try {
    const count = await execGit(projectRoot, ["rev-list", "--count", `${baseBranch}..${branchName}`]);
    aheadCount = parseInt(count.trim(), 10) || 0;
  } catch {}

  try {
    const count = await execGit(projectRoot, ["rev-list", "--count", `${branchName}..${baseBranch}`]);
    behindCount = parseInt(count.trim(), 10) || 0;
  } catch {}

  if (aheadCount > 0) {
    try {
      const log = await execGit(projectRoot, ["log", `${baseBranch}..${branchName}`, "--oneline"]);
      commits = log.split("\n").filter((l) => l.trim()).map((line) => {
        const space = line.indexOf(" ");
        return { hash: line.slice(0, space), message: line.slice(space + 1) };
      });
    } catch {}
  }

  return { branch: branchName, mainBranch: baseBranch, aheadCount, behindCount, commits };
}

export async function getBranchesWithLocks(projectRoot: string): Promise<BranchInfo[]> {
  const worktrees = await listWorktrees(projectRoot);
  const mainBranch = await detectMainBranch(projectRoot);

  // Get all branches
  let allBranches: string[] = [];
  try {
    const output = await execGit(projectRoot, ["branch", "--format=%(refname:short)"]);
    allBranches = output.split("\n").filter(l => l.trim());
  } catch { return []; }

  // Build lock map — only prismnext worktree branches are locked
  // (main branch is the primary checkout, not "locked")
  const lockMap = new Map<string, string>();
  for (const wt of worktrees) {
    lockMap.set(wt.branch, wt.name);
  }

  return allBranches.map(name => ({
    name,
    isLocked: lockMap.has(name),
    lockedBy: lockMap.get(name) || null,
  }));
}

/**
 * Sessions live in `~/.prismnext/sessions/` (P2), not inside a checkout.
 * Closing a worktree re-homes via `agent:reassignDirectory`. Do not copy into the paper folder.
 */
export async function moveSessionsToProject(
  _projectRoot: string,
  _worktreeName: string,
): Promise<number> {
  return 0;
}

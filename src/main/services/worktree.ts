import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { copyFile, cp, mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execGit } from "./git";

// ─── Types ───

export interface WorktreeInfo {
  name: string;
  path: string;        // absolute path to worktree root
  branch: string;      // "wt-calm-owl"
  baseBranch: string;  // the branch this worktree was created from
  head: string;        // latest commit SHA (short)
  aheadCount: number;  // commits ahead of main
  behindCount: number; // commits behind main (stale worktree)
}

export interface MergeStatus {
  branch: string;
  mainBranch: string;
  aheadCount: number;
  behindCount: number;
  commits: { hash: string; message: string }[];
}

export interface BranchInfo {
  name: string;
  isLocked: boolean;
  lockedBy: string | null;  // worktree name or "main"
}

// ─── Constants ───

const WORKTREES_DIR = ".prismnext/worktrees";
const BRANCH_PREFIX = "wt-";

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

function worktreePathForName(projectRoot: string, name: string): string {
  return join(projectRoot, WORKTREES_DIR, name);
}

/** Pick a random adjective-noun name not already used under .prismnext/worktrees/. */
function generateUniqueWorktreeName(projectRoot: string, maxAttempts = 64): string {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateWorktreeName();
    if (!existsSync(worktreePathForName(projectRoot, candidate))) {
      return candidate;
    }
  }
  throw new Error("Could not generate a unique worktree name — try again or remove old worktrees.");
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
  const resolvedName = name || generateUniqueWorktreeName(projectRoot);
  const branchName = `${BRANCH_PREFIX}${resolvedName}`;
  const worktreePath = worktreePathForName(projectRoot, resolvedName);

  if (existsSync(worktreePath)) {
    throw new Error(`Worktree "${resolvedName}" already exists`);
  }

  if (!existsSync(join(projectRoot, ".git"))) {
    throw new Error(
      "Git repository required. Initialize Git in this project before creating a worktree.",
    );
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

  const relPath = join(WORKTREES_DIR, resolvedName);
  await execGit(projectRoot, ["worktree", "add", "-b", branchName, relPath, resolvedBase]);

  let head = "";
  try { head = (await execGit(worktreePath, ["rev-parse", "--short", "HEAD"])).trim(); } catch {}

  // Store the base branch as metadata so listWorktrees can read it back.
  // git worktree list --porcelain doesn't track which branch a worktree was created from.
  try {
    writeFileSync(join(worktreePath, ".prism-worktree-meta"), resolvedBase, "utf-8");
  } catch {}

  return {
    name: resolvedName,
    path: normalizeWorktreePath(worktreePath),
    branch: branchName,
    baseBranch: resolvedBase,
    head,
    aheadCount: 0,
    behindCount: 0,
  };
}

export async function removeWorktree(
  projectRoot: string,
  name: string,
): Promise<void> {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid worktree name: ${name || "(empty)"}`);
  }

  const worktreePath = join(projectRoot, WORKTREES_DIR, name);
  const branchName = `${BRANCH_PREFIX}${name}`;

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
}

export async function listWorktrees(projectRoot: string): Promise<WorktreeInfo[]> {
  const worktreesDir = join(projectRoot, WORKTREES_DIR);
  if (!existsSync(worktreesDir)) return [];

  let output = "";
  try {
    output = await execGit(projectRoot, ["worktree", "list", "--porcelain"]);
  } catch {
    // Fall through to filesystem scan — git list can fail transiently during worktree remove.
  }

  const result: WorktreeInfo[] = [];
  const mainBranch = await detectMainBranch(projectRoot);

  // Parse git worktree list --porcelain output
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

    // Only include worktrees under .prismnext/worktrees/
    if (!worktreePath.includes(WORKTREES_DIR)) continue;

    const wtName = worktreePath.split("/").pop() || "";
    if (!wtName) continue;

    // Validate: worktree checkout must exist and have a .git file
    if (!existsSync(worktreePath) || !existsSync(join(worktreePath, ".git"))) continue;

    // Read the base branch from metadata file written at create time.
    // Falls back to main branch for worktrees created before this file was introduced.
    let baseBranch: string = mainBranch;
    try {
      const meta = readFileSync(join(worktreePath, ".prism-worktree-meta"), "utf-8").trim();
      if (meta) baseBranch = meta;
    } catch {}

    let aheadCount = 0;
    try {
      const count = await execGit(projectRoot, ["rev-list", "--count", `${baseBranch}..${branch}`]);
      aheadCount = parseInt(count.trim(), 10) || 0;
    } catch {}

    let behindCount = 0;
    try {
      const count = await execGit(projectRoot, ["rev-list", "--count", `${branch}..${baseBranch}`]);
      behindCount = parseInt(count.trim(), 10) || 0;
    } catch {}

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

  // Also scan the filesystem for directories in .prismnext/worktrees/ that
  // git worktree list might miss
  let dirEntries: any[];
  try { dirEntries = await readdir(worktreesDir, { withFileTypes: true }); } catch { dirEntries = []; }
  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    if (result.some((r) => r.name === entry.name)) continue;
    // Validate: must have a .git file (worktree metadata link)
    if (!existsSync(join(worktreesDir, entry.name, ".git"))) continue;
    let baseBranch: string = mainBranch;
    try {
      const meta = readFileSync(join(worktreesDir, entry.name, ".prism-worktree-meta"), "utf-8").trim();
      if (meta) baseBranch = meta;
    } catch {}
    const branch = `${BRANCH_PREFIX}${entry.name}`;
    let aheadCount = 0;
    let behindCount = 0;
    try {
      const ahead = await execGit(projectRoot, ["rev-list", "--count", `${baseBranch}..${branch}`]);
      aheadCount = parseInt(ahead.trim(), 10) || 0;
    } catch {}
    try {
      const behind = await execGit(projectRoot, ["rev-list", "--count", `${branch}..${baseBranch}`]);
      behindCount = parseInt(behind.trim(), 10) || 0;
    } catch {}
    result.push({
      name: entry.name,
      path: normalizeWorktreePath(join(worktreesDir, entry.name)),
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

  // Build lock map — only Prism worktree branches are locked
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
 * Move agent session files from a worktree to the project root.
 * Sessions are stored under .prismnext/sessions/<agent-id>/ within each worktree.
 * Copies all session files except index.json (which will be rebuilt).
 */
export async function moveSessionsToProject(
  projectRoot: string,
  worktreeName: string,
): Promise<number> {
  const worktreePath = join(projectRoot, ".prismnext", "worktrees", worktreeName);
  const sessionsDir = join(worktreePath, ".prismnext", "sessions");

  let count = 0;

  if (!existsSync(sessionsDir)) {
    return count;
  }

  try {
    const agentDirs = await readdir(sessionsDir, { withFileTypes: true });
    for (const agentDir of agentDirs) {
      if (!agentDir.isDirectory()) continue;
      const srcDir = join(sessionsDir, agentDir.name);
      const dstDir = join(projectRoot, ".prismnext", "sessions", agentDir.name);
      await mkdir(dstDir, { recursive: true });

      const files = await readdir(srcDir);
      for (const file of files) {
        if (file === "index.json") continue; // skip index, will be rebuilt
        const srcPath = join(srcDir, file);
        const dstPath = join(dstDir, file);
        await copyFile(srcPath, dstPath);
        count++;
      }
    }
  } catch {
    // If source doesn't exist or is empty, that's OK — no sessions to move
  }

  return count;
}

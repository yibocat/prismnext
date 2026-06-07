# Multi-Unit Git Worktree Orchestration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Architecture:** Standard `git worktree` per Git-unit + symlink assembly into a collection root for AI's cwd. Accept = git commit on worktree branch (not fsWrite to projectRoot). Merge = per-unit `git merge wt-xxx` into main. Non-Git units fall back to file copy + fsWrite.

**Tech Stack:** Node.js `child_process.spawn` (git), `fs/promises` (symlink, mkdir, cp, rm), Zustand stores, React + shadcn/ui.

---

### Pre-Task: Revert wrong changes, preserve good ones

The working tree currently contains incorrect "pure filesystem" worktree changes. Revert everything except the git-sidebar and files-sidebar fixes which are correct.

**Files to revert (git checkout):**
- `src/main/services/worktree.ts`
- `src/main/services/filesystem.ts` (just the `export` on constants — actually keep this, we need those exports)
- `src/main/ipc/worktree.ts`
- `src/preload/index.ts` (worktree lines only)
- `src/renderer/types/electron.d.ts` (WorktreeInfo and worktree API lines)
- `src/renderer/stores/worktree-store.ts`
- `src/renderer/stores/document-store.ts` (restore ensureProjectGit call — we'll remove it properly later)
- `src/renderer/components/modules/chat/worktree-selector.tsx`

**Files to KEEP as-is (these fixes are correct):**
- `src/renderer/components/layout/right-sidebar/git-sidebar.tsx` — removed "(Project)" entry
- `src/renderer/components/layout/right-sidebar/files-sidebar.tsx` — removed project Git status query

- [ ] Revert worktree.ts, IPC worktree.ts, preload worktree APIs, types WorktreeInfo, worktree-store.ts, document-store.ts, worktree-selector.tsx to their state before any worktree changes
- [ ] Keep filesystem.ts exports (`export const IGNORED_DIRECTORY_NAMES`, `export const IGNORED_EXTENSIONS`)
- [ ] Keep git-sidebar.tsx and files-sidebar.tsx as-is
- [ ] Run `npx tsc --noEmit` to confirm clean baseline

---

### Task 1: Git helper functions for worktree merge

**Files:**
- Modify: `src/main/services/git.ts`

Add three exported functions to support worktree merge operations.

- [ ] **Step 1: Add `getAheadCount`**

```typescript
/**
 * Count how many commits `branch` is ahead of `baseBranch`.
 * Returns 0 if branches are at the same commit or if branch doesn't exist.
 */
export async function getAheadCount(
  projectRoot: string,
  branch: string,
  baseBranch = "main",
): Promise<number> {
  try {
    const output = await execGit(projectRoot, [
      "rev-list", "--count", `${baseBranch}..${branch}`,
    ]);
    return parseInt(output.trim(), 10) || 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 2: Add `getBranchLog`**

```typescript
export interface BranchCommit {
  hash: string;
  message: string;
}

/**
 * Get commit log for commits in `branch` that are ahead of `baseBranch`.
 */
export async function getBranchLog(
  projectRoot: string,
  branch: string,
  baseBranch = "main",
): Promise<BranchCommit[]> {
  try {
    const output = await execGit(projectRoot, [
      "log", `${baseBranch}..${branch}`, "--oneline",
    ]);
    return output
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => {
        const space = line.indexOf(" ");
        return {
          hash: line.slice(0, space),
          message: line.slice(space + 1),
        };
      });
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Add `mergeBranch` (extend existing `mergeBranch` if needed)**

The existing `mergeBranch` in git.ts already does `git merge <branch>`. We can reuse it. Verify it works for our use case (merging wt-xxx into main).

- [ ] **Step 4: Add `commitInWorktree`**

```typescript
/**
 * Stage and commit a specific file in a worktree branch.
 * Used when accepting an AI edit in a worktree unit.
 */
export async function commitInWorktree(
  unitPath: string,      // e.g. chapter1/.prismnext/worktrees/calm-owl
  filePath: string,      // relative to worktree root, e.g. main.tex
  message: string,
): Promise<GitResult> {
  try {
    await execGit(unitPath, ["add", "--", filePath]);
    await execGit(unitPath, ["commit", "-m", message]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 5: Commit**

---

### Task 2: Rewrite worktree service

**Files:**
- Modify: `src/main/services/worktree.ts`

This is the core rewrite. The worktree service orchestrates `git worktree add/remove` across multiple unit repos and assembles a symlink-based collection root.

- [ ] **Step 1: Write the new types and constants**

```typescript
import { spawn } from "node:child_process";
import { mkdir, readdir, symlink, rm, copyFile } from "node:fs/promises";
import { join, basename, relative, extname } from "node:path";
import { existsSync } from "node:fs";
import { IGNORED_DIRECTORY_NAMES, IGNORED_EXTENSIONS } from "./filesystem";

export interface WorktreeUnitInfo {
  unitName: string;
  unitPath: string;           // absolute: projectRoot/chapter1
  worktreePath: string;       // absolute: chapter1/.prismnext/worktrees/calm-owl
  branch: string;             // "wt-calm-owl"
  head: string;               // latest commit SHA (short)
  aheadCount: number;         // commits ahead of main
}

export interface WorktreeInfo {
  name: string;
  path: string;               // absolute path to collection root
  units: WorktreeUnitInfo[];  // one per Git unit
  nonGitUnits: string[];      // unit folder names without .git
}

const GIT_TIMEOUT_MS = 30_000;
const WORKTREES_DIR = ".prismnext/worktrees";
const BRANCH_PREFIX = "wt-";

// Name generator (same as before)
const ADJECTIVES = ["bright","calm","quick","sharp","cool","warm","bold","swift","keen","deep","fresh","clear","smart","eager","brave","quiet"];
const NOUNS = ["fox","owl","bear","hawk","wolf","deer","dove","lynx","puma","wren","crab","koi","newt","ray","seal","swan"];

function generateWorktreeName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}
```

- [ ] **Step 2: Write `execGit` helper**

```typescript
function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "", stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, GIT_TIMEOUT_MS);
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`Git worktree timed out: git ${args.join(" ")}`));
      else if (code !== 0) reject(new Error(stderr.trim() || `git ${args[0]} exited with code ${code}`));
      else resolve(stdout);
    });
    proc.on("error", (err) => { clearTimeout(timer); reject(new Error(`Failed to spawn git: ${err.message}`)); });
  });
}
```

- [ ] **Step 3: Write `detectGitUnits`**

```typescript
/**
 * Scan projectRoot for top-level folders that have .git/ directories.
 * Returns absolute paths to those folders.
 */
async function detectGitUnits(projectRoot: string): Promise<string[]> {
  const units: string[] = [];
  let entries;
  try {
    entries = await readdir(projectRoot, { withFileTypes: true });
  } catch { return units; }
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (IGNORED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) continue;
    const gitDir = join(projectRoot, entry.name, ".git");
    if (existsSync(gitDir)) {
      units.push(join(projectRoot, entry.name));
    }
  }
  return units;
}
```

- [ ] **Step 4: Write `createWorktree`**

```typescript
/**
 * Create a new worktree across all Git units.
 * Each unit gets `git worktree add -b wt-<name> <unit>/.prismnext/worktrees/<name>/`.
 * A collection root is assembled at `.prismnext/worktrees/<name>/` via symlinks.
 */
export async function createWorktree(
  projectRoot: string,
  name?: string,
): Promise<WorktreeInfo> {
  const resolvedName = name || generateWorktreeName();
  const branchName = `${BRANCH_PREFIX}${resolvedName}`;
  const collectionRoot = join(projectRoot, WORKTREES_DIR, resolvedName);

  // Ensure collection root doesn't already exist
  if (existsSync(collectionRoot)) {
    throw new Error(`Worktree "${resolvedName}" already exists`);
  }

  const gitUnits = await detectGitUnits(projectRoot);
  const unitInfos: WorktreeUnitInfo[] = [];
  const nonGitUnits: string[] = [];
  const createdUnits: string[] = []; // for rollback

  // Create worktrees for each Git unit
  for (const unitPath of gitUnits) {
    const unitName = basename(unitPath);
    const unitWorktreeDir = join(unitPath, WORKTREES_DIR, resolvedName);
    
    try {
      await execGit(unitPath, [
        "worktree", "add", "-b", branchName, unitWorktreeDir,
      ]);
      createdUnits.push(unitName);

      let head = "";
      try {
        head = (await execGit(unitWorktreeDir, ["rev-parse", "--short", "HEAD"])).trim();
      } catch {}

      unitInfos.push({
        unitName,
        unitPath,
        worktreePath: unitWorktreeDir,
        branch: branchName,
        head,
        aheadCount: 0,
      });
    } catch (err) {
      // Rollback already-created worktrees
      for (const name of createdUnits) {
        const rollbackUnitPath = join(projectRoot, name);
        const rollbackWtDir = join(rollbackUnitPath, WORKTREES_DIR, resolvedName);
        try {
          await execGit(rollbackUnitPath, ["worktree", "remove", "--force", rollbackWtDir]);
          await execGit(rollbackUnitPath, ["branch", "-D", branchName]);
        } catch {}
      }
      throw new Error(
        `Failed to create worktree for unit "${unitName}": ${(err as Error).message}`,
      );
    }
  }

  // Detect non-Git units (top-level visible folders without .git/)
  let allEntries;
  try {
    allEntries = await readdir(projectRoot, { withFileTypes: true });
  } catch { allEntries = []; }

  for (const entry of allEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (IGNORED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) continue;
    const gitDir = join(projectRoot, entry.name, ".git");
    if (!existsSync(gitDir)) {
      nonGitUnits.push(entry.name);
    }
  }

  // Assemble collection root via symlinks
  await mkdir(collectionRoot, { recursive: true });
  try {
    // Symlink each Git unit's worktree into the collection root
    for (const info of unitInfos) {
      const linkPath = join(collectionRoot, info.unitName);
      const target = relative(collectionRoot, info.worktreePath);
      await symlink(target, linkPath, "dir");
    }

    // Copy non-Git unit files into collection root
    for (const folder of nonGitUnits) {
      await copyDirectory(
        join(projectRoot, folder),
        join(collectionRoot, folder),
      );
    }

    // Copy root-level visible files (not hidden, not artifacts)
    for (const entry of allEntries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith(".")) continue;
      if (shouldExcludeFile(entry.name)) continue;
      try {
        await copyFile(
          join(projectRoot, entry.name),
          join(collectionRoot, entry.name),
        );
      } catch {}
    }
  } catch (err) {
    // Assembly failed — clean up everything
    for (const info of unitInfos) {
      try {
        await execGit(info.unitPath, ["worktree", "remove", "--force", info.worktreePath]);
        await execGit(info.unitPath, ["branch", "-D", branchName]);
      } catch {}
    }
    try { await rm(collectionRoot, { recursive: true, force: true }); } catch {}
    throw err;
  }

  return { name: resolvedName, path: collectionRoot, units: unitInfos, nonGitUnits };
}
```

- [ ] **Step 5: Write `removeWorktree`**

```typescript
/**
 * Remove a worktree: delete collection root, remove each unit's git worktree
 * and its associated branch.
 */
export async function removeWorktree(
  projectRoot: string,
  name: string,
): Promise<void> {
  const collectionRoot = join(projectRoot, WORKTREES_DIR, name);
  const gitUnits = await detectGitUnits(projectRoot);
  const branchName = `${BRANCH_PREFIX}${name}`;

  // Remove per-unit git worktrees
  for (const unitPath of gitUnits) {
    const unitWorktreeDir = join(unitPath, WORKTREES_DIR, name);
    if (existsSync(unitWorktreeDir)) {
      try {
        await execGit(unitPath, ["worktree", "remove", "--force", unitWorktreeDir]);
      } catch {}
      try {
        await execGit(unitPath, ["branch", "-D", branchName]);
      } catch {}
    }
  }

  // Remove collection root
  if (existsSync(collectionRoot)) {
    await rm(collectionRoot, { recursive: true, force: true });
  }
}
```

- [ ] **Step 6: Write `listWorktrees`**

```typescript
/**
 * List all worktrees by scanning the collection root directory.
 */
export async function listWorktrees(projectRoot: string): Promise<WorktreeInfo[]> {
  const worktreesDir = join(projectRoot, WORKTREES_DIR);
  if (!existsSync(worktreesDir)) return [];

  const result: WorktreeInfo[] = [];
  let entries;
  try {
    entries = await readdir(worktreesDir, { withFileTypes: true });
  } catch { return []; }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const collectionRoot = join(worktreesDir, name);

    // Discover units from symlinks inside collection root
    const unitInfos: WorktreeUnitInfo[] = [];
    let wtEntries;
    try {
      wtEntries = await readdir(collectionRoot, { withFileTypes: true });
    } catch { continue; }

    for (const wtEntry of wtEntries) {
      if (!wtEntry.isDirectory() && !wtEntry.isSymbolicLink()) continue;
      const unitName = wtEntry.name;
      const unitPath = join(projectRoot, unitName);
      const unitWorktreeDir = join(unitPath, WORKTREES_DIR, name);

      if (!existsSync(unitWorktreeDir)) continue;

      // Get git info
      let head = "", aheadCount = 0;
      try {
        head = (await execGit(unitWorktreeDir, ["rev-parse", "--short", "HEAD"])).trim();
      } catch {}
      try {
        const count = await execGit(unitPath, [
          "rev-list", "--count", `main..${BRANCH_PREFIX}${name}`,
        ]);
        aheadCount = parseInt(count.trim(), 10) || 0;
      } catch {}

      unitInfos.push({
        unitName,
        unitPath,
        worktreePath: unitWorktreeDir,
        branch: `${BRANCH_PREFIX}${name}`,
        head,
        aheadCount,
      });
    }

    // Non-Git units: detect from copied directories (no symlink, no .git in original)
    const nonGitUnits: string[] = [];
    for (const wtEntry of wtEntries || []) {
      if (!wtEntry.isDirectory() || wtEntry.isSymbolicLink()) continue;
      const gitDir = join(projectRoot, wtEntry.name, ".git");
      if (!existsSync(gitDir)) {
        nonGitUnits.push(wtEntry.name);
      }
    }

    result.push({ name, path: collectionRoot, units: unitInfos, nonGitUnits });
  }

  return result;
}
```

- [ ] **Step 7: Write `getMergeStatus`**

```typescript
export interface MergeStatus {
  unitName: string;
  unitPath: string;
  branch: string;
  aheadCount: number;
  commits: { hash: string; message: string }[];
}

export async function getMergeStatus(
  projectRoot: string,
  worktreeName: string,
): Promise<MergeStatus[]> {
  const gitUnits = await detectGitUnits(projectRoot);
  const branchName = `${BRANCH_PREFIX}${worktreeName}`;
  const result: MergeStatus[] = [];

  for (const unitPath of gitUnits) {
    const unitName = basename(unitPath);
    const unitWorktreeDir = join(unitPath, WORKTREES_DIR, worktreeName);

    if (!existsSync(unitWorktreeDir)) continue;

    let aheadCount = 0;
    let commits: { hash: string; message: string }[] = [];

    try {
      const count = await execGit(unitPath, ["rev-list", "--count", `main..${branchName}`]);
      aheadCount = parseInt(count.trim(), 10) || 0;
    } catch {}

    if (aheadCount > 0) {
      try {
        const log = await execGit(unitPath, ["log", `main..${branchName}`, "--oneline"]);
        commits = log
          .split("\n")
          .filter((l) => l.trim())
          .map((line) => {
            const space = line.indexOf(" ");
            return { hash: line.slice(0, space), message: line.slice(space + 1) };
          });
      } catch {}
    }

    result.push({ unitName, unitPath, branch: branchName, aheadCount, commits });
  }

  return result;
}
```

- [ ] **Step 8: Keep file copy helpers**

Keep `shouldExcludeFile`, `copyDirectory` from the current file (they're used by non-Git unit handling and root file copy). These are the same helpers we wrote earlier.

- [ ] **Step 9: Commit**

---

### Task 3: Update IPC handlers

**Files:**
- Modify: `src/main/ipc/worktree.ts`
- Modify: `src/main/ipc/git.ts`

- [ ] **Step 1: Rewrite `src/main/ipc/worktree.ts`**

```typescript
import { ipcMain } from "electron";
import * as worktreeService from "../services/worktree";

export function registerWorktreeHandlers(): void {
  ipcMain.handle("worktree:list", async (_e, args: { projectRoot: string }) =>
    worktreeService.listWorktrees(args.projectRoot));

  ipcMain.handle("worktree:create", async (_e, args: { projectRoot: string; name?: string }) =>
    worktreeService.createWorktree(args.projectRoot, args.name));

  ipcMain.handle("worktree:remove", async (_e, args: { projectRoot: string; name: string }) =>
    worktreeService.removeWorktree(args.projectRoot, args.name));

  ipcMain.handle("worktree:mergeStatus", async (_e, args: { projectRoot: string; name: string }) =>
    worktreeService.getMergeStatus(args.projectRoot, args.name));
}
```

- [ ] **Step 2: Add git IPC handlers in `src/main/ipc/git.ts`**

Add these handlers to the existing `registerGitHandlers()`:

```typescript
ipcMain.handle("git:commitInWorktree", async (_e, args: {
  unitPath: string; filePath: string; message: string;
}) =>
  gitService.commitInWorktree(args.unitPath, args.filePath, args.message));

ipcMain.handle("git:mergeBranch", async (_e, args: {
  projectRoot: string; sourceBranch: string;
}) =>
  gitService.mergeBranch(args.projectRoot, args.sourceBranch));

ipcMain.handle("git:deleteBranch", async (_e, args: {
  projectRoot: string; branch: string;
}) =>
  gitService.deleteBranch(args.projectRoot, args.branch));
```

- [ ] **Step 3: Commit**

---

### Task 4: Update preload and types

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`

- [ ] **Step 1: Update preload worktree APIs**

Replace existing worktree lines in `preload/index.ts`:

```typescript
worktreeList: (projectRoot: string) =>
  ipcRenderer.invoke("worktree:list", { projectRoot }),
worktreeCreate: (projectRoot: string, name?: string) =>
  ipcRenderer.invoke("worktree:create", { projectRoot, name }),
worktreeRemove: (projectRoot: string, name: string) =>
  ipcRenderer.invoke("worktree:remove", { projectRoot, name }),
worktreeMergeStatus: (projectRoot: string, name: string) =>
  ipcRenderer.invoke("worktree:mergeStatus", { projectRoot, name }),
```

Add git worktree handlers:

```typescript
gitCommitInWorktree: (unitPath: string, filePath: string, message: string) =>
  ipcRenderer.invoke("git:commitInWorktree", { unitPath, filePath, message }),
gitDeleteBranch: (projectRoot: string, branch: string) =>
  ipcRenderer.invoke("git:deleteBranch", { projectRoot, branch }),
```

- [ ] **Step 2: Update type declarations in `electron.d.ts`**

```typescript
export interface WorktreeUnitInfo {
  unitName: string;
  unitPath: string;
  worktreePath: string;
  branch: string;
  head: string;
  aheadCount: number;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  units: WorktreeUnitInfo[];
  nonGitUnits: string[];
}

export interface MergeStatus {
  unitName: string;
  unitPath: string;
  branch: string;
  aheadCount: number;
  commits: { hash: string; message: string }[];
}
```

Update `ElectronAPI` interface:

```typescript
worktreeList: (projectRoot: string) => Promise<WorktreeInfo[]>;
worktreeCreate: (projectRoot: string, name?: string) => Promise<WorktreeInfo>;
worktreeRemove: (projectRoot: string, name: string) => Promise<void>;
worktreeMergeStatus: (projectRoot: string, name: string) => Promise<MergeStatus[]>;
gitCommitInWorktree: (unitPath: string, filePath: string, message: string) => Promise<GitResultData>;
gitDeleteBranch: (projectRoot: string, branch: string) => Promise<GitResultData>;
```

- [ ] **Step 3: Commit**

---

### Task 5: Rewrite worktree-store

**Files:**
- Modify: `src/renderer/stores/worktree-store.ts`

- [ ] **Step 1: Write new store**

```typescript
import { create } from "zustand";
import type { WorktreeInfo, MergeStatus } from "@/types/electron";
import { useDocumentStore } from "./document-store";

interface WorktreeState {
  worktrees: WorktreeInfo[];
  activeWorktree: WorktreeInfo | null;
  mergeStatus: MergeStatus[] | null;
  loading: boolean;
  error: string | null;

  refreshWorktrees: (projectRoot: string) => Promise<void>;
  selectWorktree: (worktree: WorktreeInfo | null) => void;
  createWorktree: (projectRoot: string, name?: string) => Promise<WorktreeInfo>;
  removeWorktree: (projectRoot: string, name: string) => Promise<void>;
  refreshMergeStatus: (projectRoot: string, name: string) => Promise<void>;
  getAffectedUnits: (projectRoot: string) => Promise<AffectedUnit[]>;
  clearAll: () => void;
}

export const useWorktreeStore = create<WorktreeState>()((set, get) => ({
  worktrees: [],
  activeWorktree: null,
  mergeStatus: null,
  loading: false,
  error: null,

  refreshWorktrees: async (projectRoot: string) => {
    set({ loading: true, error: null });
    try {
      const worktrees = await window.electronAPI.worktreeList(projectRoot);
      const active = get().activeWorktree;
      const stillExists = active
        ? worktrees.some((w) => w.name === active.name)
        : false;
      set({ worktrees, loading: false, activeWorktree: stillExists ? active : null });
    } catch (err: unknown) {
      set({ error: (err as Error).message || "Failed to list worktrees", loading: false });
    }
  },

  selectWorktree: (worktree) => set({ activeWorktree: worktree }),

  createWorktree: async (projectRoot, name?) => {
    set({ loading: true, error: null });
    try {
      const info = await window.electronAPI.worktreeCreate(projectRoot, name);
      await get().refreshWorktrees(projectRoot);
      set({ activeWorktree: info });
      return info;
    } catch (err: unknown) {
      const msg = (err as Error).message || "Failed to create worktree";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  removeWorktree: async (projectRoot, name) => {
    set({ loading: true, error: null });
    try {
      await window.electronAPI.worktreeRemove(projectRoot, name);
      if (get().activeWorktree?.name === name) set({ activeWorktree: null });
      await get().refreshWorktrees(projectRoot);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Failed to remove worktree";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  refreshMergeStatus: async (projectRoot, name) => {
    try {
      const status = await window.electronAPI.worktreeMergeStatus(projectRoot, name);
      set({ mergeStatus: status });
    } catch (err: unknown) {
      set({ error: (err as Error).message });
    }
  },

  getAffectedUnits: async (projectRoot: string) => {
    // Simplified: when a worktree is active, we don't scan projectRoot.
    // Merge operation uses refreshMergeStatus instead.
    return [];
  },

  clearAll: () => set({
    worktrees: [], activeWorktree: null, mergeStatus: null,
    loading: false, error: null,
  }),
}));
```

- [ ] **Step 2: Keep `AffectedUnit` import and type compatibility**

The existing `getAffectedUnits` returns `AffectedUnit[]`. We'll stub it for now since the merge dialog replaces its use case. Keep the `AffectedUnit` type import for backward compatibility.

- [ ] **Step 3: Commit**

---

### Task 6: Modify changes-store for worktree commit on Accept

**Files:**
- Modify: `src/renderer/stores/changes-store.ts`

- [ ] **Step 1: Add `unitName` and `worktreePath` fields to `ProposedChange`**

```typescript
export interface ProposedChange {
  id: string;
  filePath: string;          // relative path within unit, e.g. "main.tex"
  absolutePath: string;      // absolute path in worktree (NOT projectRoot)
  unitName?: string;         // which unit this file belongs to, e.g. "chapter1"
  unitPath?: string;         // absolute path to unit in projectRoot
  isGitUnit?: boolean;       // true if unit has .git (Accept = commit)
  oldContent: string;
  newContent: string;
  toolName: string;
  timestamp: number;
}
```

- [ ] **Step 2: Modify `acceptChange`**

```typescript
acceptChange: async (id) => {
  const change = get().changes.find((c) => c.id === id);
  if (!change) return;

  if (change.isGitUnit && change.unitPath) {
    // Git unit: commit in the worktree branch
    // The file was already written by AI to the worktree path
    // We just need to git add + git commit
    try {
      const unitWtDir = change.absolutePath.includes("/.prismnext/worktrees/")
        ? change.absolutePath.slice(0, change.absolutePath.indexOf(
            "/.prismnext/worktrees/") + "/.prismnext/worktrees/".length
          ) + change.absolutePath.slice(
            change.absolutePath.indexOf("/.prismnext/worktrees/") + "/.prismnext/worktrees/".length
          ).split("/")[0]
        : "";
      // Simpler approach: derive worktree dir from unitPath + worktree name
      const worktreeName = useWorktreeStore.getState().activeWorktree?.name;
      if (!worktreeName) return;
      const wtDir = `${change.unitPath}/.prismnext/worktrees/${worktreeName}`;
      await window.electronAPI.gitCommitInWorktree(
        wtDir,
        change.filePath,
        `AI edit: ${change.filePath}`,
      );
    } catch (err) {
      console.error("[changes] acceptChange commit failed:", err);
      return;
    }
  } else {
    // Non-Git unit: write back to projectRoot (existing behavior)
    try {
      await window.electronAPI.fsWrite(change.absolutePath, change.newContent);
      const docState = useDocumentStore.getState();
      const file = docState.files.find((f) => f.relativePath === change.filePath);
      if (file) await docState.refreshFileContent(file.id);
    } catch (err) {
      console.error("[changes] acceptChange write failed:", err);
      return;
    }
  }

  set((state) => ({
    changes: state.changes.filter((c) => c.id !== id),
  }));
},
```

- [ ] **Step 3: Simplify `acceptChange` for worktree commit**

Actually, the above is complex. Let me simplify. The key insight: when AI edits a file in the worktree, the worktree file IS the actual file on disk (it's a git worktree). The AI's edit tool writes to it. So on Accept, we just need to commit what's already there.

```typescript
acceptChange: async (id) => {
  const change = get().changes.find((c) => c.id === id);
  if (!change) return;

  const wt = useWorktreeStore.getState().activeWorktree;

  if (change.isGitUnit && wt) {
    // Find the matching unit in the active worktree
    const unit = wt.units.find((u) => u.unitName === change.unitName);
    if (unit) {
      try {
        await window.electronAPI.gitCommitInWorktree(
          unit.worktreePath,
          change.filePath,
          `[prism] AI edit: ${change.filePath}`,
        );
        set((state) => ({ changes: state.changes.filter((c) => c.id !== id) }));
        return;
      } catch (err) {
        console.error("[changes] worktree commit failed:", err);
        return;
      }
    }
  }

  // Fallback: fsWrite to projectRoot (non-Git units or no worktree active)
  try {
    await window.electronAPI.fsWrite(change.absolutePath, change.newContent);
    const docState = useDocumentStore.getState();
    const file = docState.files.find((f) => f.relativePath === change.filePath);
    if (file) await docState.refreshFileContent(file.id);
    set((state) => ({ changes: state.changes.filter((c) => c.id !== id) }));
  } catch (err) {
    console.error("[changes] acceptChange write failed:", err);
  }
},
```

- [ ] **Step 4: Update `acceptAll` similarly**

- [ ] **Step 5: Commit**

---

### Task 7: Modify use-cli-events for unit resolution

**Files:**
- Modify: `src/renderer/hooks/use-cli-events.ts`

- [ ] **Step 1: Update `registerProposedChange` to resolve unit name and mark isGitUnit**

Replace the path mapping section (lines 54-65) with:

```typescript
const worktreeStore = useWorktreeStore.getState();
const activeWorktree = worktreeStore.activeWorktree;

let resolvedPath = filePath;
let unitName: string | undefined;
let unitPath: string | undefined;
let isGitUnit = false;

if (activeWorktree && projectRoot) {
  // filePath is something like:
  // /abs/path/.prismnext/worktrees/calm-owl/chapter1/main.tex
  // or resolved through symlink to chapter1/.prismnext/worktrees/calm-owl/main.tex
  if (filePath.startsWith(activeWorktree.path)) {
    // Relative to collection root: strip prefix
    const relToCollection = filePath.slice(activeWorktree.path.length).replace(/^\//, "");
    const firstSlash = relToCollection.indexOf("/");
    if (firstSlash > 0) {
      unitName = relToCollection.slice(0, firstSlash);
    }
  }

  // Find matching unit in active worktree
  if (unitName) {
    const matchingUnit = activeWorktree.units.find((u) => u.unitName === unitName);
    if (matchingUnit) {
      unitPath = matchingUnit.unitPath;
      isGitUnit = true;
      // Path relative to the unit's worktree root
      resolvedPath = filePath; // Keep as-is — it's the worktree path
    }
  }
}

let relativePath = resolvedPath;
if (projectRoot && resolvedPath.startsWith(projectRoot)) {
  relativePath = resolvedPath.slice(projectRoot.length).replace(/^\//, "");
}
// If not relative to projectRoot, use the unit-relative path
if (relativePath === resolvedPath && unitName) {
  // Extract unit-relative part
  const wtName = activeWorktree?.name;
  if (wtName) {
    const marker = `/.prismnext/worktrees/${wtName}/`;
    const idx = resolvedPath.indexOf(marker);
    if (idx > 0) {
      relativePath = resolvedPath.slice(idx + marker.length);
    }
  }
}
```

- [ ] **Step 2: Update `changesStore.addChange` call to include unit info**

At the end of `registerProposedChange`, where `addChange` is called (around line 116):

```typescript
useChangesStore.getState().addChange({
  id: toolUseId,
  filePath: relativePath,
  absolutePath: resolvedPath,
  unitName,
  unitPath,
  isGitUnit,
  oldContent,
  newContent,
  toolName,
});
```

- [ ] **Step 3: Commit**

---

### Task 8: Rewrite worktree-selector UI

**Files:**
- Modify: `src/renderer/components/modules/chat/worktree-selector.tsx`

- [ ] **Step 1: Rewrite selector — simpler, no project Git logic**

Same as the version we already wrote (no `hasProjectGit`, no `ensureProjectGit`), but display unit count instead of `head`:

```tsx
{/* Existing worktrees */}
{worktrees.map((wt) => (
  <DropdownMenuItem
    key={wt.name}
    onClick={() => handleSelectWorktree(wt.name)}
    className="text-[length:var(--font-chat-meta)] group"
  >
    <GitBranchIcon className="size-3.5 shrink-0" />
    <span className="truncate flex-1">{wt.name}</span>
    <span className="text-[length:var(--font-hint)] text-muted-foreground/50 shrink-0 ml-1">
      {wt.units.length}u
    </span>
    {activeWorktree?.name === wt.name && (
      <span className="text-[length:var(--font-badge)] text-primary shrink-0">active</span>
    )}
    <button ...> {/* delete button — same as before */} </button>
  </DropdownMenuItem>
))}
```

- [ ] **Step 2: Commit**

---

### Task 9: Create merge-worktree-dialog

**Files:**
- Create: `src/renderer/components/modules/chat/merge-worktree-dialog.tsx`

- [ ] **Step 1: Write the dialog component**

```tsx
import { useState, useEffect, useCallback } from "react";
import { GitBranchIcon, Loader2Icon, GitMergeIcon, AlertTriangleIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import type { MergeStatus } from "@/types/electron";

export function MergeWorktreeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { activeWorktree, mergeStatus, refreshMergeStatus, loading } = useWorktreeStore();
  const [merging, setMerging] = useState(false);
  const [results, setResults] = useState<Map<string, { success: boolean; error?: string }>>(new Map());

  useEffect(() => {
    if (open && activeWorktree && projectRoot) {
      refreshMergeStatus(projectRoot, activeWorktree.name);
      setResults(new Map());
    }
  }, [open, activeWorktree, projectRoot, refreshMergeStatus]);

  const handleMergeAll = useCallback(async () => {
    if (!activeWorktree || !mergeStatus) return;
    setMerging(true);
    const newResults = new Map<string, { success: boolean; error?: string }>();

    for (const unit of mergeStatus) {
      if (unit.aheadCount === 0) continue;
      try {
        // 1. Checkout main
        await window.electronAPI.gitCheckout(unit.unitPath, "main");
        // 2. Merge worktree branch
        const result = await window.electronAPI.gitMerge(unit.unitPath, unit.branch);
        if (result.success) {
          // 3. Delete worktree branch
          try { await window.electronAPI.gitDeleteBranch(unit.unitPath, unit.branch); } catch {}
          newResults.set(unit.unitName, { success: true });
        } else {
          newResults.set(unit.unitName, { success: false, error: result.error });
        }
      } catch (err: unknown) {
        newResults.set(unit.unitName, { success: false, error: (err as Error).message });
      }
    }

    setResults(newResults);
    setMerging(false);
  }, [activeWorktree, mergeStatus]);

  if (!activeWorktree) return null;

  const hasAhead = mergeStatus?.some((u) => u.aheadCount > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMergeIcon className="size-4" />
            Merge Worktree: {activeWorktree.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-80 overflow-y-auto">
          {mergeStatus?.map((unit) => (
            <div key={unit.unitName} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranchIcon className="size-3.5" />
                  <span className="font-medium text-sm">{unit.unitName}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {unit.aheadCount} commit{unit.aheadCount !== 1 ? "s" : ""} ahead
                </span>
              </div>
              {unit.commits.length > 0 && (
                <div className="mt-2 space-y-1">
                  {unit.commits.map((c) => (
                    <div key={c.hash} className="text-xs text-muted-foreground flex gap-2">
                      <code className="text-[10px]">{c.hash}</code>
                      <span className="truncate">{c.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {results.has(unit.unitName) && (
                <div className={`mt-2 text-xs ${results.get(unit.unitName)!.success ? "text-green-600" : "text-destructive"}`}>
                  {results.get(unit.unitName)!.success
                    ? "Merged successfully"
                    : `Failed: ${results.get(unit.unitName)!.error}`}
                </div>
              )}
            </div>
          ))}
          {(!mergeStatus || mergeStatus.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No Git units to merge
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merging}>
            Close
          </Button>
          <Button onClick={handleMergeAll} disabled={merging || !hasAhead}>
            {merging ? <Loader2Icon className="size-4 animate-spin mr-1" /> : null}
            Merge All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 10: Add merge button to left-main-area

**Files:**
- Modify: `src/renderer/components/layout/left-main-area.tsx`

- [ ] **Step 1: Add "Merge worktree" button near the worktree commit button**

Find where `WorktreeCommitDialog` is rendered and add the merge button nearby, conditional on `activeWorktree !== null`:

```tsx
{activeWorktree && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => setMergeDialogOpen(true)}
    className="text-xs gap-1"
  >
    <GitMergeIcon className="size-3" />
    Merge
  </Button>
)}
```

- [ ] **Step 2: Wire up the merge dialog state and render**

```tsx
const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

// ... in JSX:
<MergeWorktreeDialog open={mergeDialogOpen} onClose={() => setMergeDialogOpen(false)} />
```

- [ ] **Step 3: Import the dialog**

```tsx
import { MergeWorktreeDialog } from "@/components/modules/chat/merge-worktree-dialog";
```

- [ ] **Step 4: Commit**

---

### Task 11: Final integration and TypeScript verification

- [ ] **Step 1: Remove unused `ensureProjectGit` calls**

In `document-store.ts`, the `ensureProjectGit` call was already removed in the current diff. Verify it's gone.

- [ ] **Step 2: Remove unused `hasProjectGit`, `ensureProjectGit` from worktree-store**

These were already removed from the worktree-store in the current diff. Verify.

- [ ] **Step 3: Remove `worktree:hasProjectGit`, `worktree:initProjectGit` from IPC and preload**

These were already removed. Verify.

- [ ] **Step 4: Run `npx tsc --noEmit`**

Expected: no errors.

- [ ] **Step 5: Commit**

---

### Task 12: Manual E2E verification

- [ ] Create a test project with 2 unit folders, each with `git init`
- [ ] Create a worktree — verify collection root exists with symlinks
- [ ] Verify `git worktree list` in each unit shows the worktree
- [ ] Edit a file in one unit's worktree — verify changesStore captures it with `unitName` and `isGitUnit`
- [ ] Accept — verify git commit lands on `wt-xxx` branch
- [ ] Verify `projectRoot/chapter1/main.tex` unchanged
- [ ] Open merge dialog — verify ahead counts correct
- [ ] Merge All — verify files update in projectRoot, Git panel shows merge commit
- [ ] Delete worktree — verify cleanup

# Unified Git Worktree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace federated multi-unit worktree orchestration with standard single-repo `git worktree` — simplify from ~2600 to ~300 net lines changed.

**Architecture:** One project root = one git repo. `git worktree add` creates a standard linked worktree. AI cwd = real git repo. Accept = `git commit` on worktree branch. Merge = standard `git merge`. No unit-level git orchestration.

**Tech Stack:** Node.js `child_process.spawn` (git), Zustand stores, React 19 + shadcn/ui.

---

### Task 1: Rewrite worktree service

**Files:**
- Rewrite: `src/main/services/worktree.ts`

- [ ] **Step 1: Write the new simplified worktree service**

Replace the entire file. The new version is ~100 lines — no `detectGitUnits`, `syncWorktree`, `copyDirVisible`, rollback logic, or non-Git unit handling.

```typescript
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

// ─── Types ───

export interface WorktreeInfo {
  name: string;
  path: string;        // absolute path to worktree root
  branch: string;      // "wt-calm-owl"
  head: string;        // latest commit SHA (short)
  aheadCount: number;  // commits ahead of main
}

export interface MergeStatus {
  branch: string;
  aheadCount: number;
  commits: { hash: string; message: string }[];
}

// ─── Constants ───

const GIT_TIMEOUT_MS = 30_000;
const WORKTREES_DIR = ".prismnext/worktrees";
const BRANCH_PREFIX = "wt-";

const ADJECTIVES = ["bright","calm","quick","sharp","cool","warm","bold","swift","keen","deep","fresh","clear","smart","eager","brave","quiet"];
const NOUNS = ["fox","owl","bear","hawk","wolf","deer","dove","lynx","puma","wren","crab","koi","newt","ray","seal","swan"];

function generateWorktreeName(): string {
  return `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}-${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`;
}

// ─── Git execution ───

function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["-c", "core.quotepath=false", ...args], {
      cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
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

async function detectMainBranch(repoPath: string): Promise<string> {
  for (const name of ["main", "master"]) {
    try { await execGit(repoPath, ["rev-parse", "--verify", name]); return name; } catch {}
  }
  try {
    const ref = await execGit(repoPath, ["symbolic-ref", "--short", "HEAD"]);
    return ref.trim();
  } catch { return "main"; }
}

// ─── Public API ───

export async function createWorktree(
  projectRoot: string,
  name?: string,
): Promise<WorktreeInfo> {
  const resolvedName = name || generateWorktreeName();
  const branchName = `${BRANCH_PREFIX}${resolvedName}`;
  const worktreePath = join(projectRoot, WORKTREES_DIR, resolvedName);

  if (existsSync(worktreePath)) {
    throw new Error(`Worktree "${resolvedName}" already exists`);
  }

  // Ensure at least one commit exists (git worktree add requires it)
  try { await execGit(projectRoot, ["rev-parse", "HEAD"]); } catch {
    await execGit(projectRoot, ["commit", "--allow-empty", "-m", "Initial setup"]);
  }

  // Clean up zombie branch if it exists
  try { await execGit(projectRoot, ["branch", "-D", branchName]); } catch {}

  const relPath = join(WORKTREES_DIR, resolvedName);
  await execGit(projectRoot, ["worktree", "add", "-b", branchName, relPath]);

  let head = "";
  try { head = (await execGit(worktreePath, ["rev-parse", "--short", "HEAD"])).trim(); } catch {}

  return { name: resolvedName, path: worktreePath, branch: branchName, head, aheadCount: 0 };
}

export async function removeWorktree(
  projectRoot: string,
  name: string,
): Promise<void> {
  const worktreePath = join(projectRoot, WORKTREES_DIR, name);
  const branchName = `${BRANCH_PREFIX}${name}`;

  // Remove worktree (--force handles dirty state)
  if (existsSync(worktreePath)) {
    try { await execGit(projectRoot, ["worktree", "remove", "--force", worktreePath]); } catch {}
  }

  // Delete branch
  try { await execGit(projectRoot, ["branch", "-D", branchName]); } catch {}
}

export async function listWorktrees(projectRoot: string): Promise<WorktreeInfo[]> {
  const worktreesDir = join(projectRoot, WORKTREES_DIR);
  if (!existsSync(worktreesDir)) return [];

  let output: string;
  try {
    output = await execGit(projectRoot, ["worktree", "list", "--porcelain"]);
  } catch {
    return [];
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
        branch = line.slice(15);
      }
    }

    // Only include worktrees under .prismnext/worktrees/
    if (!worktreePath.includes(WORKTREES_DIR)) continue;

    const wtName = worktreePath.split("/").pop() || "";
    if (!wtName) continue;

    // Skip main worktree (the bare repo itself)
    if (branch === mainBranch) continue;

    let aheadCount = 0;
    try {
      const count = await execGit(projectRoot, ["rev-list", "--count", `${mainBranch}..${branch}`]);
      aheadCount = parseInt(count.trim(), 10) || 0;
    } catch {}

    result.push({ name: wtName, path: worktreePath, branch, head, aheadCount });
  }

  // Also scan the filesystem for directories in .prismnext/worktrees/ that
  // git worktree list might miss (e.g. if the worktree metadata file was lost)
  let dirEntries;
  try { dirEntries = await readdir(worktreesDir, { withFileTypes: true }); } catch { dirEntries = []; }
  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    if (result.some((r) => r.name === entry.name)) continue;
    // Stale directory — mark as orphaned with empty branch
    result.push({
      name: entry.name,
      path: join(worktreesDir, entry.name),
      branch: `${BRANCH_PREFIX}${entry.name}`,
      head: "",
      aheadCount: 0,
    });
  }

  return result;
}

export async function getMergeStatus(
  projectRoot: string,
  worktreeName: string,
): Promise<MergeStatus> {
  const branchName = `${BRANCH_PREFIX}${worktreeName}`;
  const mainBranch = await detectMainBranch(projectRoot);

  let aheadCount = 0;
  let commits: { hash: string; message: string }[] = [];

  try {
    const count = await execGit(projectRoot, ["rev-list", "--count", `${mainBranch}..${branchName}`]);
    aheadCount = parseInt(count.trim(), 10) || 0;
  } catch {}

  if (aheadCount > 0) {
    try {
      const log = await execGit(projectRoot, ["log", `${mainBranch}..${branchName}`, "--oneline"]);
      commits = log.split("\n").filter((l) => l.trim()).map((line) => {
        const space = line.indexOf(" ");
        return { hash: line.slice(0, space), message: line.slice(space + 1) };
      });
    } catch {}
  }

  return { branch: branchName, aheadCount, commits };
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/services/worktree.ts 2>&1 | head -20
```

---

### Task 2: Clean up git service

**Files:**
- Modify: `src/main/services/git.ts`

- [ ] **Step 1: Remove `commitInWorktree` function**

Delete the entire `commitInWorktree` function (lines 889-901 in current staged version). This is the block:
```typescript
export async function commitInWorktree(
  unitWorktreePath: string,
  filePath: string,
  message: string,
): Promise<GitResult> {
  // ... delete this entire function
}
```

- [ ] **Step 2: Remove unused `unlink` import if no longer needed**

Check if `unlink` from `node:fs/promises` is still used (it is, in `discardChanges`). No change needed.

- [ ] **Step 3: Remove `deleteBranch` export if it was only for worktree**

Check: `deleteBranch` is used by worktree service. Keep it — it's still useful for `git branch -D` after merge.

- [ ] **Step 4: Verify the file compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/services/git.ts 2>&1 | head -20
```

---

### Task 3: Update IPC git handler

**Files:**
- Modify: `src/main/ipc/git.ts`

- [ ] **Step 1: Remove the `git:commitInWorktree` IPC handler**

Read the file first, then remove the handler for `git:commitInWorktree` if present.

```bash
cd prism-next && grep -n "commitInWorktree" src/main/ipc/git.ts
```

If it exists, delete the handler block.

---

### Task 4: Update IPC worktree handler

**Files:**
- Modify: `src/main/ipc/worktree.ts`

The worktree IPC handler file is fine as-is — it delegates to the worktree service. The service signatures changed (return types simplified) but the IPC handler signatures are the same. No changes needed unless TypeScript complains about return type mismatch.

- [ ] **Step 1: Verify IPC worktree handler compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/ipc/worktree.ts 2>&1 | head -20
```

---

### Task 5: Update preload

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Remove `gitCommitInWorktree` from preload**

Delete lines 154-155:
```typescript
  gitCommitInWorktree: (unitPath: string, filePath: string, message: string) =>
    ipcRenderer.invoke("git:commitInWorktree", { unitPath, filePath, message }),
```

- [ ] **Step 2: Verify preload compiles**

```bash
cd prism-next && npx tsc --noEmit src/preload/index.ts 2>&1 | head -20
```

---

### Task 6: Simplify types

**Files:**
- Modify: `src/renderer/types/electron.d.ts`

- [ ] **Step 1: Replace worktree types section**

Remove the `WorktreeUnitInfo` interface entirely. Replace `WorktreeInfo` and `MergeStatus` with simplified versions. Find the block starting at line 112:

```typescript
// ── Worktree types ──

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
  mainBranch: string;
  branch: string;
  aheadCount: number;
  commits: { hash: string; message: string }[];
}
```

Replace with:

```typescript
// ── Worktree types ──

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  head: string;
  aheadCount: number;
}

export interface MergeStatus {
  branch: string;
  aheadCount: number;
  commits: { hash: string; message: string }[];
}
```

- [ ] **Step 2: Update ElectronAPI interface — remove `gitCommitInWorktree`**

Delete this line from the `ElectronAPI` interface:
```typescript
  gitCommitInWorktree: (unitPath: string, filePath: string, message: string) => Promise<GitResultData>;
```

- [ ] **Step 3: Update `worktreeMergeStatus` return type**

Change:
```typescript
  worktreeMergeStatus: (projectRoot: string, name: string) => Promise<MergeStatus[]>;
```
To:
```typescript
  worktreeMergeStatus: (projectRoot: string, name: string) => Promise<MergeStatus>;
```

- [ ] **Step 4: Verify types file compiles**

```bash
cd prism-next && npx tsc --noEmit src/renderer/types/electron.d.ts 2>&1 | head -20
```

---

### Task 7: Simplify worktree store

**Files:**
- Modify: `src/renderer/stores/worktree-store.ts`

- [ ] **Step 1: Rewrite the store with simplified types**

Replace the entire file:

```typescript
import { create } from "zustand";
import type { WorktreeInfo, MergeStatus } from "@/types/electron";

interface WorktreeState {
  worktrees: WorktreeInfo[];
  activeWorktree: WorktreeInfo | null;
  mergeStatus: MergeStatus | null;
  loading: boolean;
  error: string | null;

  refreshWorktrees: (projectRoot: string) => Promise<void>;
  selectWorktree: (worktree: WorktreeInfo | null) => void;
  createWorktree: (projectRoot: string, name?: string) => Promise<WorktreeInfo>;
  removeWorktree: (projectRoot: string, name: string) => Promise<void>;
  refreshMergeStatus: (projectRoot: string, name: string) => Promise<void>;
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
      const stillExists = active ? worktrees.some((w) => w.name === active.name) : false;
      set({ worktrees, loading: false, activeWorktree: stillExists ? active : null });
    } catch (err: unknown) {
      set({ error: (err as Error).message || "Failed to list worktrees", loading: false });
    }
  },

  selectWorktree: (worktree) => set({ activeWorktree: worktree, mergeStatus: null }),

  createWorktree: async (projectRoot, name?) => {
    set({ loading: true, error: null });
    try {
      const info = await window.electronAPI.worktreeCreate(projectRoot, name);
      await get().refreshWorktrees(projectRoot);
      set({ activeWorktree: info });
      return info;
    } catch (err: unknown) {
      set({ error: (err as Error).message || "Failed to create worktree", loading: false });
      throw err;
    }
  },

  removeWorktree: async (projectRoot, name) => {
    set({ loading: true, error: null });
    try {
      await window.electronAPI.worktreeRemove(projectRoot, name);
      if (get().activeWorktree?.name === name) set({ activeWorktree: null, mergeStatus: null });
      await get().refreshWorktrees(projectRoot);
    } catch (err: unknown) {
      set({ error: (err as Error).message || "Failed to remove worktree", loading: false });
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

  clearAll: () => set({ worktrees: [], activeWorktree: null, mergeStatus: null, loading: false, error: null }),
}));
```

---

### Task 8: Simplify changes store

**Files:**
- Modify: `src/renderer/stores/changes-store.ts`

- [ ] **Step 1: Remove `unitName`, `unitPath`, `isGitUnit` from ProposedChange**

Change the interface:
```typescript
export interface ProposedChange {
  id: string;
  filePath: string;
  absolutePath: string;
  oldContent: string;
  newContent: string;
  toolName: string;
  timestamp: number;
}
```

Remove `unitName?: string;`, `unitPath?: string;`, `isGitUnit?: boolean;`.

- [ ] **Step 2: Rewrite `acceptChange` — always git commit in worktree, fallback to fsWrite**

Replace the entire `acceptChange` function:

```typescript
  acceptChange: async (id) => {
    const change = get().changes.find((c) => c.id === id);
    if (!change) return;

    const wt = useWorktreeStore.getState().activeWorktree;

    if (wt) {
      // In a worktree: git commit on the worktree branch
      try {
        await window.electronAPI.gitCommit(
          wt.path,
          `[prism] AI edit: ${change.filePath}`,
        );
        set((state) => ({ changes: state.changes.filter((c) => c.id !== id) }));
        return;
      } catch (err) {
        console.error("[changes] worktree commit failed:", err);
        return;
      }
    }

    // No worktree: fsWrite to projectRoot
    try {
      await window.electronAPI.fsWrite(change.absolutePath, change.newContent);
      const docState = useDocumentStore.getState();
      const file = docState.files.find((f) => f.relativePath === change.filePath);
      if (file) {
        await docState.refreshFileContent(file.id);
      } else {
        await docState.refreshFiles();
      }
    } catch (err) {
      console.error("[changes] acceptChange write failed:", err);
      return;
    }

    set((state) => ({
      changes: state.changes.filter((c) => c.id !== id),
    }));
  },
```

**Important:** The `gitCommit` call now uses the worktree path as `projectRoot` and does NOT stage individual files. The worktree's working tree already has the AI's edits applied (the files on disk were modified by the AI agent). So we just `git add -A && git commit` implicitly — actually, we need to change this to use `git add` first, then commit.

Actually, we need to stage the file first. Let's use `commitAll` from git.ts instead:

```typescript
    if (wt) {
      try {
        await window.electronAPI.gitCommitAll(
          wt.path,
          [change.filePath],
          `[prism] AI edit: ${change.filePath}`,
        );
        ...
```

But we don't have `gitCommitAll` in the preload/types yet. Let's add it, or use the simpler approach: since AI already wrote the file to disk, we can use `git add <file> && git commit`.

Actually, looking at `git.ts`, `commitAll` already exists. We need to expose it via IPC/preload/types.

Or simpler: expose `commitAll` via preload. Let me adjust:

We need to add `gitCommitAll` to:
1. `src/renderer/types/electron.d.ts` — add to `ElectronAPI`
2. `src/preload/index.ts` — add the bridge
3. `src/main/ipc/git.ts` — add handler (if not already there)

Let me check if there's already a handler for commitAll...

Looking at `git.ts`, `commitAll` takes `(projectRoot, filePaths, message)`. We need an IPC handler. Let me add one.

- [ ] **Step 3: Add `gitCommitAll` support**

In `src/main/ipc/git.ts`, add (or verify exists):
```typescript
ipcMain.handle("git:commitAll", async (_e, args: { projectRoot: string; filePaths: string[]; message: string }) =>
  gitService.commitAll(args.projectRoot, args.filePaths, args.message));
```

In `src/preload/index.ts`, add:
```typescript
  gitCommitAll: (projectRoot: string, filePaths: string[], message: string) =>
    ipcRenderer.invoke("git:commitAll", { projectRoot, filePaths, message }),
```

In `src/renderer/types/electron.d.ts`, add inside `ElectronAPI`:
```typescript
  gitCommitAll: (projectRoot: string, filePaths: string[], message: string) => Promise<GitResultData>;
```

- [ ] **Step 4: Rewrite `acceptAll`**

Replace `acceptAll` to use the same pattern — worktree commits or fsWrite fallback. The key change: remove all `isGitUnit` / `unitName` branching.

```typescript
  acceptAll: async () => {
    const { changes } = get();
    if (changes.length === 0) return;

    const wt = useWorktreeStore.getState().activeWorktree;
    const docState = useDocumentStore.getState();
    const succeeded: string[] = [];

    if (wt) {
      // In worktree: stage and commit all changed files at once
      try {
        const filePaths = changes.map((c) => c.filePath);
        await window.electronAPI.gitCommitAll(
          wt.path, filePaths,
          `[prism] AI edits across ${changes.length} file(s)`,
        );
        succeeded.push(...changes.map((c) => c.id));
      } catch (err) {
        console.error("[changes] acceptAll worktree commit failed:", err);
      }
    } else {
      // No worktree: fsWrite each file
      for (const change of changes) {
        try {
          await window.electronAPI.fsWrite(change.absolutePath, change.newContent);
          const file = docState.files.find((f) => f.relativePath === change.filePath);
          if (file) await docState.refreshFileContent(file.id);
          succeeded.push(change.id);
        } catch (err) {
          console.error("[changes] acceptAll failed for", change.filePath, err);
        }
      }
      if (succeeded.length < changes.length) {
        await docState.refreshFiles();
      }
    }

    set((state) => ({
      changes: state.changes.filter((c) => !succeeded.includes(c.id)),
    }));
  },
```

---

### Task 9: Clean up document store

**Files:**
- Modify: `src/renderer/stores/document-store.ts`

- [ ] **Step 1: Remove worktree-related imports and usage**

Search for worktree-related code in document-store.ts:
```bash
cd prism-next && grep -n "worktree\|ensureProjectGit\|WorktreeInfo" src/renderer/stores/document-store.ts
```

Currently the staged version may have `ensureProjectGit` calls. If present, remove them. The current version at HEAD (unstaged) doesn't have them, so this may be a no-op.

- [ ] **Step 2: Verify document-store compiles**

```bash
cd prism-next && npx tsc --noEmit src/renderer/stores/document-store.ts 2>&1 | head -20
```

---

### Task 10: Add worktreeContext to git store

**Files:**
- Modify: `src/renderer/stores/git-store.ts`

- [ ] **Step 1: Add `worktreeContext` to state and update `selectUnit`**

Add to the `GitState` interface:
```typescript
  worktreeContext: string | null;  // active worktree path, null = main
```

Add to initial state (after `unitRoot: null`):
```typescript
  worktreeContext: null,
```

- [ ] **Step 2: Rewrite `selectUnit` — remove unit-level worktree path resolution**

Replace the current `selectUnit` implementation:

```typescript
  selectUnit: async (path: string) => {
    set({ unitRoot: path });
    await get().checkRepo(path);
  },
```

**Rationale:** With unified git, `unitRoot` is just a path to a git repo root. The worktree resolution is handled at a higher level — the caller passes the correct path (worktree path or projectRoot).

- [ ] **Step 3: Add `setWorktreeContext` action**

```typescript
  setWorktreeContext: (context: string | null) => set({ worktreeContext: context }),
```

- [ ] **Step 4: Update `clearAll` to include `worktreeContext`**

Add `worktreeContext: null` to the `clearAll` reset object.

---

### Task 11: Refactor git-sidebar for worktree awareness

**Files:**
- Modify: `src/renderer/components/layout/right-sidebar/git-sidebar.tsx`

- [ ] **Step 1: Rewrite git-sidebar — single git repo, worktree-aware**

The key change: when a worktree is active, `unitRoot` should point to the worktree path. The sidebar shows the project's git status from either the main repo or the worktree.

Replace the entire file:

```typescript
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderGit2Icon,
  RefreshCwIcon,
  GitBranchIcon,
  GitMergeIcon,
} from "lucide-react";
import { useGitStore } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

export function GitSidebar() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const branch = useGitStore((s) => s.branch);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const refreshStatus = useGitStore((s) => s.refreshStatus);
  const refreshBranches = useGitStore((s) => s.refreshBranches);
  const selectUnit = useGitStore((s) => s.selectUnit);
  const checkRepo = useGitStore((s) => s.checkRepo);

  // Auto-select the git root on mount / worktree change
  useEffect(() => {
    if (!projectRoot) return;
    const wt = useWorktreeStore.getState().activeWorktree;
    const root = wt?.path ?? projectRoot;
    selectUnit(root);
  }, [projectRoot, activeWorktree, selectUnit]);

  const handleRefresh = useCallback(async () => {
    if (!unitRoot) return;
    await refreshStatus(unitRoot);
    await refreshBranches(unitRoot);
  }, [unitRoot, refreshStatus, refreshBranches]);

  const inWorktree = activeWorktree !== null;

  return (
    <>
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between px-3">
        <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          Git
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCwIcon className="size-3.5" />
        </button>
      </SidebarHeader>

      <SidebarContent className="px-1.5 py-1">
        {checkingRepo ? (
          <div className="px-2 py-4 text-[length:var(--font-size-12)] text-muted-foreground text-center">
            Checking git...
          </div>
        ) : !isGitRepo ? (
          <div className="px-2 py-4 text-[length:var(--font-size-12)] text-muted-foreground text-center">
            No git repository
          </div>
        ) : (
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                isActive
                className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground w-full justify-start gap-2 pl-2"
              >
                <FolderGit2Icon className="shrink-0" />
                <span className="truncate flex-1">
                  {inWorktree ? `wt:${activeWorktree.name}` : (projectRoot?.split("/").pop() || "project")}
                </span>
                <span className="text-[length:var(--font-hint)] text-muted-foreground/50 shrink-0">
                  {branch}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarContent>
    </>
  );
}
```

---

### Task 12: Update files-sidebar for worktree-aware git status

**Files:**
- Modify: `src/renderer/components/layout/right-sidebar/files-sidebar.tsx`

- [ ] **Step 1: Simplify git status fetching — single repo**

Replace the `doFetchGitStatus` function (lines 492-534). Instead of scanning each unit folder for `.git/`, query the single project-level git:

```typescript
  const doFetchGitStatus = useCallback(async () => {
    if (!projectRoot) return;
    const combined = new Map<string, { isDeleted: boolean; isStagedOnly: boolean; isUnstaged: boolean; isUntracked: boolean }>();

    try {
      // Use worktree path if active, otherwise project root
      const wt = useWorktreeStore.getState().activeWorktree;
      const gitRoot = wt?.path ?? projectRoot;

      const dotGitExists = await window.electronAPI.fsExists(`${gitRoot}/.git`);
      if (!dotGitExists) {
        // Also check for .git file (worktree metadata)
        const gitFileExists = await window.electronAPI.fsExists(`${gitRoot}/.git`);
        if (!gitFileExists) { setGitStatusMap(combined); return; }
      }

      const status = await window.electronAPI.gitStatus(gitRoot);
      for (const f of status.files) {
        const isDeleted = f.worktreeStatus === "D" || f.indexStatus === "D";
        const isStagedOnly = f.staged && !f.unstaged;
        const isUnstaged = f.unstaged;
        const isUntracked = f.untracked;
        combined.set(f.path, { isStagedOnly, isUnstaged, isUntracked, isDeleted });
      }
    } catch { /* repo not readable */ }

    setGitStatusMap(combined);
  }, [projectRoot]);
```

- [ ] **Step 2: Add import for worktreeStore**

At the top, add:
```typescript
import { useWorktreeStore } from "@/stores/worktree-store";
```

- [ ] **Step 3: Remove unit-folder scanning loop**

Remove the comment block about "Multi-unit Git status" and the `for (const folder of topFolders)` loop. The new version queries ONE git repo.

---

### Task 13: Simplify worktree-selector

**Files:**
- Modify: `src/renderer/components/modules/chat/worktree-selector.tsx`

- [ ] **Step 1: Remove unit count display from worktree list items**

Replace the unit count display. Currently line 134 shows `{wt.units.length > 0 ? ...}`. Replace with:

```typescript
              <span className="text-[length:var(--font-hint)] text-muted-foreground/50 shrink-0 ml-1">
                {wt.aheadCount > 0 ? `${wt.aheadCount}↑` : ""}
              </span>
```

Also remove the `GitBranchIcon` for non-Git unit indicator — it's no longer relevant.

- [ ] **Step 2: Remove imports for removed types**

No imports to remove — the component imports from stores, not directly from types.

---

### Task 14: Simplify merge-worktree-dialog

**Files:**
- Modify: `src/renderer/components/modules/chat/merge-worktree-dialog.tsx`

- [ ] **Step 1: Rewrite for single-repo merge**

Replace the entire file — from per-unit merge loop to single merge:

```typescript
import { useState, useEffect, useCallback } from "react";
import { GitBranchIcon, Loader2Icon, GitMergeIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";

export function MergeWorktreeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { activeWorktree, mergeStatus, refreshMergeStatus, refreshWorktrees } = useWorktreeStore();
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (open && activeWorktree && projectRoot) {
      refreshMergeStatus(projectRoot, activeWorktree.name);
      setResult(null);
    }
  }, [open, activeWorktree, projectRoot, refreshMergeStatus]);

  const handleMerge = useCallback(async () => {
    if (!activeWorktree || !projectRoot) return;
    setMerging(true);

    try {
      // Switch to main branch on the project repo
      await window.electronAPI.gitCheckout(projectRoot, "main");
      // Merge the worktree branch
      const mergeResult = await window.electronAPI.gitMerge(projectRoot, activeWorktree.branch);
      if (mergeResult.success) {
        try { await window.electronAPI.gitDeleteBranch(projectRoot, activeWorktree.branch); } catch {}
        // Remove the worktree directory
        try { await window.electronAPI.worktreeRemove(projectRoot, activeWorktree.name); } catch {}
        setResult({ success: true });
      } else {
        setResult({ success: false, error: mergeResult.error || "Merge failed" });
      }
    } catch (err: unknown) {
      setResult({ success: false, error: (err as Error).message });
    }

    setMerging(false);
    await refreshWorktrees(projectRoot);
  }, [activeWorktree, projectRoot, refreshWorktrees]);

  if (!activeWorktree) return null;

  const hasAhead = mergeStatus && mergeStatus.aheadCount > 0;

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
          {mergeStatus && mergeStatus.aheadCount > 0 ? (
            <div className="rounded border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <GitBranchIcon className="size-3.5" />
                  <span className="font-medium text-sm">{activeWorktree.branch}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {mergeStatus.aheadCount} commit{mergeStatus.aheadCount !== 1 ? "s" : ""} ahead of main
                </span>
              </div>
              {mergeStatus.commits.map((c) => (
                <div key={c.hash} className="text-xs text-muted-foreground flex gap-2 py-0.5">
                  <code className="text-[10px]">{c.hash}</code>
                  <span className="truncate">{c.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              {mergeStatus ? "No commits to merge" : "Loading..."}
            </div>
          )}

          {result && (
            <div className={`text-sm p-2 rounded ${result.success ? "text-green-600 bg-green-50 dark:bg-green-950" : "text-destructive bg-destructive/10"}`}>
              {result.success
                ? "Merged successfully! Worktree removed."
                : `Merge failed: ${result.error}`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merging}>
            {result?.success ? "Close" : "Cancel"}
          </Button>
          {!result?.success && (
            <Button onClick={handleMerge} disabled={merging || !hasAhead}>
              {merging ? <Loader2Icon className="size-4 animate-spin mr-1" /> : null}
              Merge into main
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Task 15: Simplify use-cli-events

**Files:**
- Modify: `src/renderer/hooks/use-cli-events.ts`

- [ ] **Step 1: Rewrite `registerProposedChange` — remove unit resolution**

Replace lines 41-98 (the `registerProposedChange` function body). The new version simply maps worktree paths to project-relative paths:

```typescript
  function registerProposedChange(
    filePath: string,
    toolUseId: string,
    toolName: string,
    toolInput: any,
    capturedOldContent: string,
  ) {
    const docState = useDocumentStore.getState();
    const projectRoot = docState.projectRoot;
    const worktreeStore = useWorktreeStore.getState();
    const activeWorktree = worktreeStore.activeWorktree;

    let resolvedPath = filePath;

    // If in a worktree, map worktree-absolute path to project-relative
    if (activeWorktree && projectRoot && filePath.startsWith(activeWorktree.path)) {
      // Keep the absolute path pointing at the worktree (where the file actually lives)
      resolvedPath = filePath;
    }

    let relativePath = resolvedPath;
    if (activeWorktree && resolvedPath.startsWith(activeWorktree.path)) {
      relativePath = resolvedPath.slice(activeWorktree.path.length).replace(/^\//, "");
    } else if (projectRoot && resolvedPath.startsWith(projectRoot)) {
      relativePath = resolvedPath.slice(projectRoot.length).replace(/^\//, "");
    }

    const file = docState.files.find(
      (f) => f.relativePath === relativePath || f.absolutePath === filePath,
    );

    const isNewFile = !file && toolName.toLowerCase().startsWith("write");

    if (!file && !isNewFile) {
      log.debug("file not found in project", { filePath, relativePath, projectFiles: docState.files.length });
      return;
    }

    const trackedContent = file ? fileContentTrackerRef.current.get(file.relativePath) : undefined;
    const fallback = capturedOldContent || (file ? docState.getContent(file.id) : "") || "";
    const oldContent = trackedContent ?? (isNewFile ? "" : fallback);

    const name = toolName.toLowerCase();
    let newContent: string;

    if (name.startsWith("write")) {
      newContent = toolInput?.content ?? "";
    } else if (name.startsWith("multiedit") && Array.isArray(toolInput?.edits)) {
      newContent = oldContent;
      for (const edit of toolInput.edits) {
        const oldStr: string = edit.old_string ?? "";
        const newStr: string = edit.new_string ?? "";
        if (oldStr === "" && newStr === "") continue;
        const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newContent = newContent.replace(new RegExp(escaped), newStr);
      }
    } else if (name.startsWith("edit")) {
      const oldStr: string = toolInput?.old_string ?? "";
      const newStr: string = toolInput?.new_string ?? "";
      if (oldStr === "" && newStr === "") {
        log.debug("empty edit — skipping", { toolName, filePath });
        return;
      }
      const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newContent = oldContent.replace(new RegExp(escaped), newStr);
    } else {
      log.debug("unknown tool — skipping", { toolName, filePath });
      return;
    }

    if (oldContent !== newContent) {
      if (file) {
        fileContentTrackerRef.current.set(file.relativePath, newContent);
      }

      useChangesStore.getState().addChange({
        id: toolUseId,
        filePath: relativePath,
        absolutePath: resolvedPath,
        oldContent,
        newContent,
        toolName,
      });

      const rpState = useRightPanelStore.getState();
      const existingTab = rpState.tabs.find((t) => t.filePath === relativePath);
      if (!existingTab) {
        const fileName = relativePath.split("/").pop() || relativePath;
        rpState.openFile(relativePath, relativePath, fileName);
      }
    }
  }
```

Key changes:
- Removed all `for (const unit of activeWorktree.units)` loops
- Removed `unitName`, `unitPath`, `isGitUnit` from `addChange` call
- Simplified path resolution: worktree path → project-relative

---

### Task 16: Adjust left-main-area

**Files:**
- Modify: `src/renderer/components/layout/left-main-area.tsx`

- [ ] **Step 1: No major changes needed**

The Merge button logic at line 184-189 is already correct — it shows when `activeWorktree` is non-null. The merge dialog component is being rewritten in Task 14. No further changes needed.

---

### Task 17: TypeScript check and final cleanup

- [ ] **Step 1: Run full TypeScript check**

```bash
cd prism-next && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 2: Fix any type errors**

Address each error individually — likely from:
- Removed types referenced elsewhere
- Missing IPC channel for `gitCommitAll`
- Signature mismatches between preload and types

- [ ] **Step 3: Verify all deleted code is gone**

```bash
cd prism-next && grep -r "WorktreeUnitInfo\|detectGitUnits\|syncWorktree\|nonGitUnit\|isGitUnit\|unitName.*change\|commitInWorktree" src/ 2>/dev/null
```

Expected: no results (or only in docs/).

- [ ] **Step 4: Git add and verify diff**

```bash
cd prism-next && git diff --stat
```

- [ ] **Step 5: Build check**

```bash
cd prism-next && pnpm build 2>&1 | tail -20
```

---

### Summary: Files Changed

| # | File | Change | Net Lines |
|---|------|--------|-----------|
| 1 | `main/services/worktree.ts` | **Rewrite** 350→100 | -250 |
| 2 | `main/services/git.ts` | Remove `commitInWorktree` | -15 |
| 3 | `main/ipc/git.ts` | Remove `commitInWorktree` handler, add `commitAll` | ~+5 |
| 4 | `main/ipc/worktree.ts` | No change (types flow from service) | 0 |
| 5 | `preload/index.ts` | Remove `gitCommitInWorktree`, add `gitCommitAll` | ~+2 |
| 6 | `renderer/types/electron.d.ts` | Simplify WorktreeInfo/MergeStatus, remove WorktreeUnitInfo | -15 |
| 7 | `renderer/stores/worktree-store.ts` | Simplify (MergeStatus[]→MergeStatus) | ~0 |
| 8 | `renderer/stores/changes-store.ts` | Remove unitName/isGitUnit, simplify Accept | -30 |
| 9 | `renderer/stores/document-store.ts` | Clean up any worktree references | ~0 |
| 10 | `renderer/stores/git-store.ts` | Add worktreeContext, simplify selectUnit | +5 |
| 11 | `renderer/components/layout/right-sidebar/git-sidebar.tsx` | Rewrite for single-repo + worktree-aware | -40 |
| 12 | `renderer/components/layout/right-sidebar/files-sidebar.tsx` | Simplify git status to single repo | -20 |
| 13 | `renderer/components/modules/chat/worktree-selector.tsx` | Remove unit count, header cleanup | -5 |
| 14 | `renderer/components/modules/chat/merge-worktree-dialog.tsx` | Rewrite single merge | -30 |
| 15 | `renderer/hooks/use-cli-events.ts` | Remove unit resolution | -45 |
| 16 | `renderer/components/layout/left-main-area.tsx` | No change | 0 |

**Net: ~-450 lines across 16 files.**

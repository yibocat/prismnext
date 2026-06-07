# Branch-Worktree Dual Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add branch selector to toolbar, decouple Accept/Reject from git operations, enable branch switching with locked-branch awareness, and make worktree creation branch-aware.

**Architecture:** Branch selector sits between agent selector and worktree selector in the chat toolbar. Worktree creation takes current branch as base. Accept/Reject are pure file ops. Git panel shows locked branches. Standard git worktree semantics throughout.

**Tech Stack:** TypeScript (strict), Zustand, React 19, shadcn/ui, child_process (git).

---

### Task 1: Add `baseBranch` to types and worktree service

**Files:**
- Modify: `src/renderer/types/electron.d.ts`
- Modify: `src/main/services/worktree.ts`
- Modify: `src/main/ipc/worktree.ts`

- [ ] **Step 1: Add `baseBranch` to `WorktreeInfo`**

In `src/renderer/types/electron.d.ts`, change the WorktreeInfo interface:

```typescript
export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  baseBranch: string;
  head: string;
  aheadCount: number;
}
```

- [ ] **Step 2: Update `createWorktree` in worktree service**

In `src/main/services/worktree.ts`, update `createWorktree` signature and logic:

```typescript
export async function createWorktree(
  projectRoot: string,
  name?: string,
  baseBranch?: string,
): Promise<WorktreeInfo> {
  const resolvedName = name || generateWorktreeName();
  const branchName = `${BRANCH_PREFIX}${resolvedName}`;
  const worktreePath = join(projectRoot, WORKTREES_DIR, resolvedName);

  if (existsSync(worktreePath)) {
    throw new Error(`Worktree "${resolvedName}" already exists`);
  }

  // Ensure git is initialized
  if (!existsSync(join(projectRoot, ".git"))) {
    await execGit(projectRoot, ["init"]);
    const gitignorePath = join(projectRoot, ".gitignore");
    if (!existsSync(gitignorePath)) {
      const { writeFile } = await import("node:fs/promises");
      const defaultGitignore = [
        "# LaTeX build artifacts",
        "*.aux", "*.log", "*.out", "*.toc", "*.bbl", "*.blg", "*.synctex.gz",
        "*.fdb_latexmk", "*.fls", "*.xdv", "*.nav", "*.snm", "*.vrb",
        "",
        "# Prism internal data",
        ".prismnext/",
        "",
        "# System",
        ".DS_Store", "Thumbs.db",
        "*.swp", "*.swo", "*~",
        "",
      ].join("\n") + "\n";
      try { await writeFile(gitignorePath, defaultGitignore); } catch {}
    }
  }

  // Ensure at least one commit exists
  try { await execGit(projectRoot, ["rev-parse", "HEAD"]); } catch {
    try {
      await execGit(projectRoot, ["add", "-A"]);
      await execGit(projectRoot, ["commit", "-m", "Initial project setup"]);
    } catch {
      await execGit(projectRoot, ["commit", "--allow-empty", "-m", "Initial project setup"]);
    }
  }

  // Resolve base branch — default to current branch
  const resolvedBase = baseBranch || (await detectMainBranch(projectRoot));

  // Clean up zombie branch if it exists
  try { await execGit(projectRoot, ["branch", "-D", branchName]); } catch {}

  // Create worktree from the selected base branch
  const relPath = join(WORKTREES_DIR, resolvedName);
  await execGit(projectRoot, ["worktree", "add", "-b", branchName, relPath, resolvedBase]);

  let head = "";
  try { head = (await execGit(worktreePath, ["rev-parse", "--short", "HEAD"])).trim(); } catch {}

  return {
    name: resolvedName,
    path: worktreePath,
    branch: branchName,
    baseBranch: resolvedBase,
    head,
    aheadCount: 0,
  };
}
```

Also update `getMergeStatus` to use `baseBranch` instead of detecting main:

```typescript
export async function getMergeStatus(
  projectRoot: string,
  worktreeName: string,
): Promise<MergeStatus> {
  const gitUnits = await listWorktrees(projectRoot);
  const wt = gitUnits.find(w => w.name === worktreeName);
  const branchName = `${BRANCH_PREFIX}${worktreeName}`;
  const baseBranch = wt?.baseBranch || await detectMainBranch(projectRoot);

  let aheadCount = 0;
  let commits: { hash: string; message: string }[] = [];

  try {
    const count = await execGit(projectRoot, ["rev-list", "--count", `${baseBranch}..${branchName}`]);
    aheadCount = parseInt(count.trim(), 10) || 0;
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

  return { branch: branchName, mainBranch: baseBranch, aheadCount, commits };
}
```

And add a `getBranches` helper that returns all branches with their lock status:

```typescript
export interface BranchInfo {
  name: string;
  isLocked: boolean;
  lockedBy: string | null;  // worktree name or "main" for the primary worktree
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

  // Build lock map: which branches are checked out where
  const lockMap = new Map<string, string>();
  lockMap.set(mainBranch, "main"); // main worktree locks main branch
  for (const wt of worktrees) {
    lockMap.set(wt.branch, wt.name);
  }

  return allBranches.map(name => ({
    name,
    isLocked: lockMap.has(name),
    lockedBy: lockMap.get(name) || null,
  }));
}
```

- [ ] **Step 3: Update IPC worktree handler**

In `src/main/ipc/worktree.ts`, update the create handler signature:

```typescript
ipcMain.handle("worktree:create", async (_e, args: { projectRoot: string; name?: string; baseBranch?: string }) =>
  worktreeService.createWorktree(args.projectRoot, args.name, args.baseBranch));
```

Add a new handler for branches with locks:

```typescript
ipcMain.handle("worktree:branches", async (_e, args: { projectRoot: string }) =>
  worktreeService.getBranchesWithLocks(args.projectRoot));
```

- [ ] **Step 4: Verify**

```bash
cd prism-next && ./node_modules/.bin/tsc --noEmit src/main/services/worktree.ts src/main/ipc/worktree.ts 2>&1
```

---

### Task 2: Simplify changes-store — pure file ops

**Files:**
- Modify: `src/renderer/stores/changes-store.ts`

- [ ] **Step 1: Rewrite `acceptChange` — always fsWrite, no git**

Replace the `acceptChange` function:

```typescript
  acceptChange: async (id) => {
    const change = get().changes.find((c) => c.id === id);
    if (!change) return;

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

- [ ] **Step 2: Rewrite `acceptAll` — batch fsWrite**

```typescript
  acceptAll: async () => {
    const { changes } = get();
    if (changes.length === 0) return;

    const docState = useDocumentStore.getState();
    const succeeded: string[] = [];

    for (const change of changes) {
      try {
        await window.electronAPI.fsWrite(change.absolutePath, change.newContent);
        const file = docState.files.find((f) => f.relativePath === change.filePath);
        if (file) {
          await docState.refreshFileContent(file.id);
        }
        succeeded.push(change.id);
      } catch (err) {
        console.error("[changes] acceptAll failed for", change.filePath, err);
      }
    }

    if (succeeded.length < changes.length) {
      await docState.refreshFiles();
    }

    set((state) => ({
      changes: state.changes.filter((c) => !succeeded.includes(c.id)),
    }));
  },
```

- [ ] **Step 3: Remove `gitCommitAll` imports and calls**

Remove `import { useWorktreeStore } from "./worktree-store";` if it's no longer used (check — it's not in the new code above).

- [ ] **Step 4: Verify**

```bash
cd prism-next && ./node_modules/.bin/tsc --noEmit src/renderer/stores/changes-store.ts 2>&1
```

---

### Task 3: Update preload, types, and IPC for new APIs

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Modify: `src/main/ipc/git.ts` (if needed for branches)

- [ ] **Step 1: Update preload**

In `src/preload/index.ts`, update worktree create:

```typescript
  worktreeCreate: (projectRoot: string, name?: string, baseBranch?: string) =>
    ipcRenderer.invoke("worktree:create", { projectRoot, name, baseBranch }),
```

Add branches-with-locks:

```typescript
  worktreeBranches: (projectRoot: string) =>
    ipcRenderer.invoke("worktree:branches", { projectRoot }),
```

Remove `gitCommitAll` if present:

```bash
grep -n "gitCommitAll" src/preload/index.ts
```

If present, delete the line.

- [ ] **Step 2: Update types**

In `src/renderer/types/electron.d.ts`, add `BranchInfo`:

```typescript
export interface BranchInfo {
  name: string;
  isLocked: boolean;
  lockedBy: string | null;
}
```

Update `ElectronAPI`:

```typescript
  // Worktree operations
  worktreeList: (projectRoot: string) => Promise<WorktreeInfo[]>;
  worktreeCreate: (projectRoot: string, name?: string, baseBranch?: string) => Promise<WorktreeInfo>;
  worktreeRemove: (projectRoot: string, name: string) => Promise<void>;
  worktreeMergeStatus: (projectRoot: string, name: string) => Promise<MergeStatus>;
  worktreeBranches: (projectRoot: string) => Promise<BranchInfo[]>;
```

Remove `gitCommitAll` from `ElectronAPI`:

```bash
grep -n "gitCommitAll" src/renderer/types/electron.d.ts
```

If present, delete the line.

- [ ] **Step 3: Remove git:commitAll IPC handler (if no other callers)**

Check:
```bash
grep -r "gitCommitAll\|git:commitAll" src/ --include="*.ts" --include="*.tsx" | grep -v ".git"
```

If only in IPC handler + preload + types, remove all three.

- [ ] **Step 4: Verify**

```bash
cd prism-next && ./node_modules/.bin/tsc --noEmit 2>&1 | head -20
```

---

### Task 4: Update stores

**Files:**
- Modify: `src/renderer/stores/worktree-store.ts`
- Modify: `src/renderer/stores/git-store.ts`

- [ ] **Step 1: Update worktree-store — add `baseBranch` parameter**

```typescript
  createWorktree: async (projectRoot, name?, baseBranch?) => {
    set({ loading: true, error: null });
    try {
      const info = await window.electronAPI.worktreeCreate(projectRoot, name, baseBranch);
      await get().refreshWorktrees(projectRoot);
      set({ activeWorktree: info });
      return info;
    } catch (err: unknown) {
      set({ error: (err as Error).message || "Failed to create worktree", loading: false });
      throw err;
    }
  },
```

Add `branches` and `refreshBranches` to state:

```typescript
interface WorktreeState {
  // ... existing ...
  branches: BranchInfo[];
  refreshBranches: (projectRoot: string) => Promise<void>;
}
```

With implementation:

```typescript
  branches: [],

  refreshBranches: async (projectRoot: string) => {
    try {
      const branches = await window.electronAPI.worktreeBranches(projectRoot);
      set({ branches });
    } catch {}
  },
```

And add to `clearAll`:
```typescript
  clearAll: () => set({ worktrees: [], activeWorktree: null, mergeStatus: null, branches: [], loading: false, error: null }),
```

- [ ] **Step 2: Update git-store — locked branch check**

In `switchBranch` in `src/renderer/stores/git-store.ts`, add locked check. Read the current `switchBranch` first, then add this guard at the top:

```typescript
  switchBranch: async (projectRoot: string, branch: string) => {
    // Check if branch is locked by another worktree
    const { useWorktreeStore } = await import("./worktree-store");
    const wt = useWorktreeStore.getState();
    const branchInfo = wt.branches.find(b => b.name === branch);
    if (branchInfo?.isLocked) {
      const lockedBy = branchInfo.lockedBy === "main" ? "main worktree" : `worktree "${branchInfo.lockedBy}"`;
      toast.error(`Cannot switch to "${branch}" — it is checked out in ${lockedBy}`);
      return;
    }

    // ... existing switch logic ...
    const result = await window.electronAPI.gitCheckout(projectRoot, branch);
    // ...
  },
```

Also add to `selectUnit` import in `useEffect` of git-sidebar: `selectUnit` should be called with the git root based on worktree context.

- [ ] **Step 3: Verify**

```bash
cd prism-next && ./node_modules/.bin/tsc --noEmit 2>&1 | head -20
```

---

### Task 5: Add branch selector component

**Files:**
- Create: `src/renderer/components/modules/chat/branch-selector.tsx`

- [ ] **Step 1: Create branch selector component**

```typescript
import { useEffect, useCallback } from "react";
import { GitBranchIcon, LockIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { cn } from "@/lib/utils";
import type { BranchInfo } from "@/types/electron";

export function BranchSelector() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const currentBranch = useGitStore((s) => s.branch);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const branches = useWorktreeStore((s) => s.branches);
  const refreshBranches = useWorktreeStore((s) => s.refreshBranches);

  useEffect(() => {
    if (projectRoot && isGitRepo) {
      refreshBranches(projectRoot);
    }
  }, [projectRoot, isGitRepo, refreshBranches]);

  const handleSelectBranch = useCallback(
    async (branch: BranchInfo) => {
      if (branch.isLocked) return; // Locked — do nothing
      if (!projectRoot) return;
      if (branch.name === currentBranch) return; // Already on this branch

      await useGitStore.getState().switchBranch(projectRoot, branch.name);
    },
    [projectRoot, currentBranch],
  );

  // Don't show if no git
  if (!isGitRepo || !projectRoot) return null;

  const displayBranch = activeWorktree ? activeWorktree.branch : currentBranch;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1",
            "text-[length:var(--font-chat-meta)] transition-colors",
            "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <GitBranchIcon className="size-3.5" />
          <span className="max-w-[100px] truncate">{displayBranch || "..."}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.name}
            onClick={() => handleSelectBranch(b)}
            disabled={b.isLocked}
            className={cn(
              "text-[length:var(--font-chat-meta)]",
              b.isLocked && "opacity-50",
            )}
          >
            <GitBranchIcon className="size-3.5 shrink-0" />
            <span className="truncate flex-1">{b.name}</span>
            {b.name === (activeWorktree?.branch ?? currentBranch) && (
              <span className="text-[length:var(--font-badge)] text-primary shrink-0 ml-1">current</span>
            )}
            {b.isLocked && (
              <span className="text-[length:var(--font-badge)] text-muted-foreground shrink-0 ml-1 flex items-center gap-0.5">
                <LockIcon className="size-2.5" />
                {b.lockedBy === "main" ? "main" : b.lockedBy}
              </span>
            )}
          </DropdownMenuItem>
        ))}
        {branches.length === 0 && (
          <div className="px-2 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
            No branches
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

### Task 6: Update toolbar layout and wire worktree selector

**Files:**
- Modify: `src/renderer/components/layout/left-main-area.tsx`
- Modify: `src/renderer/components/modules/chat/worktree-selector.tsx`

- [ ] **Step 1: Add BranchSelector to toolbar**

In `left-main-area.tsx`, add the import and place it between agent selector and worktree selector.

Find the agent selector dropdown (around line 155-180) and add `BranchSelector` right after it:

```typescript
import { BranchSelector } from "@/components/modules/chat/branch-selector";
```

In the toolbar JSX (both the homepage view and chat view), add the component between the agent selector and `WorktreeSelector`:

```tsx
{/* Agent selector dropdown */}
<DropdownMenu>...</DropdownMenu>

<BranchSelector />

<WorktreeSelector />
```

- [ ] **Step 2: Update WorktreeSelector to pass baseBranch**

In `worktree-selector.tsx`, update `handleCreateWorktree` to pass the current branch:

```typescript
  const currentBranch = useGitStore((s) => s.branch);

  const handleCreateWorktree = useCallback(async () => {
    if (!projectRoot) return;
    try {
      await createWorktree(projectRoot, undefined, currentBranch);
    } catch {
      // error is already in store
    }
  }, [projectRoot, createWorktree, currentBranch]);
```

Add import: `import { useGitStore } from "@/stores/git-store";`

---

### Task 7: Update merge dialog for baseBranch

**Files:**
- Modify: `src/renderer/components/modules/chat/merge-worktree-dialog.tsx`

- [ ] **Step 1: Use `baseBranch` from `MergeStatus` or `activeWorktree`**

The merge dialog already uses `mergeStatus?.mainBranch` (from the earlier fix). The `getMergeStatus` was updated in Task 1 to return the correct `mainBranch` (which is `baseBranch`). Verify the merge dialog uses this correctly. The current code does:

```typescript
const mainBranch = mergeStatus?.mainBranch || "main";
await window.electronAPI.gitCheckout(projectRoot, mainBranch);
await window.electronAPI.gitMerge(projectRoot, activeWorktree.branch);
```

This is correct — `mainBranch` in `MergeStatus` is now the worktree's `baseBranch`. No changes needed unless the field name changed.

- [ ] **Step 2: Verify merge destination label**

Update the dialog text to show the correct merge target:

```tsx
<span className="text-xs text-muted-foreground">
  {mergeStatus.aheadCount} commit{...} ahead of {mergeStatus.mainBranch}
</span>
```

---

### Task 8: TypeScript check and final cleanup

- [ ] **Step 1: Run full TypeScript check**

```bash
cd prism-next && ./node_modules/.bin/tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 2: Fix any type errors**

Address each error individually.

- [ ] **Step 3: Verify all old references are cleaned**

```bash
grep -r "gitCommitAll" src/ --include="*.ts" --include="*.tsx"
```

Expected: no results.

- [ ] **Step 4: Git diff summary**

```bash
git -C prism-next diff --stat
```

---

### Summary

| # | Task | Files |
|---|------|-------|
| 1 | `baseBranch` in types + worktree service + `getBranchesWithLocks` | `types/electron.d.ts`, `services/worktree.ts`, `ipc/worktree.ts` |
| 2 | Simplify changes-store (pure fsWrite) | `stores/changes-store.ts` |
| 3 | Preload + types + IPC cleanup | `preload/index.ts`, `types/electron.d.ts`, `ipc/git.ts` |
| 4 | Update stores (worktree + git) | `stores/worktree-store.ts`, `stores/git-store.ts` |
| 5 | Branch selector component | `components/modules/chat/branch-selector.tsx` (new) |
| 6 | Toolbar layout + worktree selector wiring | `left-main-area.tsx`, `worktree-selector.tsx` |
| 7 | Merge dialog (verify baseBranch) | `merge-worktree-dialog.tsx` |
| 8 | TypeScript check + cleanup | All files |

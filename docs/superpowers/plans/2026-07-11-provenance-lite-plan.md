# Provenance Lite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add append-only **`.prismnext/provenance.jsonl`** so experiment runs and **claimed** output artifacts are traceable (command, env, chat session). UX: enhance existing Experiments **artifact chips** → Provenance inspector（不重做整个 Runs UI）。See parent spec §0 for the full desired user journey.

**Architecture:** `runs.jsonl` remains source of truth for experiment tools; provenance is a cross-cutting event log written from `experiment-log-service.appendRun`. Shared types in `src/shared/provenance.ts`; main service handles append/read; renderer queries via `provenance:*` IPC. Phase 1.1 adds `download_recorded` on PDF ingest and optional mtime inference.

**Tech stack:** TypeScript (shared + main + renderer), JSONL append, Vitest, existing Experiments mode UI.

**Parent spec:** `docs/superpowers/specs/2026-07-11-provenance-lite-design.md`

**Depends on:** paper-search MCP experience builtin is landed; Phase 1 core run provenance can start now. Phase 1.1 `download_recorded` can follow.

**Status:** ✅ Implemented (2026-07-15) - Phase 1 + Phase 1.1 landed. One pre-existing unrelated test failure (`chat-cancel-preserve`) confirmed failing on committed master before this work.

---

## File map (created / modified)

| File | Role |
|------|------|
| `src/shared/provenance.ts` | **Create** — schema types, constants, type guards |
| `src/main/services/provenance-service.ts` | **Create** — append, read, query helpers |
| `tests/main/provenance-service.test.ts` | **Create** — append + query tests |
| `src/shared/experiment-log.ts` | Optional fields on `ExperimentRunEntry` |
| `src/main/services/experiment-log-service.ts` | Hook provenance after `appendRun` |
| `src/main/services/experiment-log-bridge.ts` | Pass `sessionId` into appendRun |
| `src/main/services/experiment-run-executor.ts` | Pass sessionId when appending |
| `src/main/ipc/provenance.ts` | **Create** — `provenance:getForArtifact`, `getForRun` |
| `src/main/ipc/index.ts` | Register provenance handlers |
| `src/preload/index.ts` | Expose `provenanceGetForArtifact`, `provenanceGetForRun` |
| `src/renderer/types/electron.d.ts` | IPC types |
| `src/renderer/modes/experiments-mode/experiments-provenance-inspector.tsx` | **Create** — inspector panel |
| `src/renderer/modes/experiments-mode/experiments-runs-table.tsx` | Wire artifact click → inspector |
| `src/main/prompts/modules/experiments.ts` | One line on artifacts[] discipline |
| `src/main/ipc/literature.ts` | Phase 1.1 — `download_recorded` on ingestPdf |
| `tests/main/experiment-log-service.test.ts` | Assert optional provenance fields don't break readers |

---

## Event model quick reference

```text
append_run succeeds
  → runs.jsonl line (unchanged authority)
  → provenance.jsonl:
       { type: "run_recorded", runId, command, env, artifacts, chatSessionId, … }
       { type: "artifact_linked", runId, artifactPath, linkMethod: "explicit", … }  × N
```

---

### Task 1: Shared provenance types

**Files:**
- Create: `src/shared/provenance.ts`
- Create: `tests/main/provenance-types.test.ts`

- [x] **Step 1: Write type guard tests**

Create `tests/main/provenance-types.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  PROVENANCE_SCHEMA_VERSION,
  isProvenanceRunRecorded,
  type ProvenanceRunRecorded,
} from "../../src/shared/provenance";

describe("provenance types", () => {
  it("recognizes run_recorded events", () => {
    const event: ProvenanceRunRecorded = {
      id: "prov_test",
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      type: "run_recorded",
      at: "2026-07-11T12:00:00.000Z",
      workspaceRel: "experiment",
      chatSessionId: "ses_abc",
      gitBranch: null,
      gitCommit: "abc1234",
      experimentId: "exp-20260711-test-a1b2",
      runId: "run_20260711_120000_x1",
      command: "python scripts/train.py",
      cwd: "experiment/exp-20260711-test-a1b2",
      exitCode: 0,
      startedAt: "2026-07-11T12:00:00.000Z",
      finishedAt: "2026-07-11T12:00:05.000Z",
      env: { python: "/usr/bin/python3", pythonVersion: "3.12", platform: "darwin", gitCommit: "abc1234" },
      artifacts: ["experiment/exp-20260711-test-a1b2/results/plot.png"],
      stdoutTailBytes: 0,
      stderrTailBytes: 0,
    };
    expect(isProvenanceRunRecorded(event)).toBe(true);
  });
});
```

- [x] **Step 2: Run — expect FAIL**

Run: `pnpm test tests/main/provenance-types.test.ts`

- [x] **Step 3: Implement `src/shared/provenance.ts`**

```typescript
/** Append-only provenance log under `.prismnext/provenance.jsonl`. */

export const PROVENANCE_REL = ".prismnext/provenance.jsonl";
export const PROVENANCE_META_REL = ".prismnext/provenance.meta.json";

export const PROVENANCE_SCHEMA_VERSION = 1 as const;

export type ProvenanceEventType =
  | "run_recorded"
  | "artifact_linked"
  | "download_recorded";

export interface ProvenanceEventBase {
  id: string;
  schemaVersion: typeof PROVENANCE_SCHEMA_VERSION;
  type: ProvenanceEventType;
  at: string;
  workspaceRel: string;
  chatSessionId: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
}

export interface ProvenanceRunRecorded extends ProvenanceEventBase {
  type: "run_recorded";
  experimentId: string | null;
  runId: string;
  command: string;
  cwd: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  env: {
    python: string | null;
    pythonVersion: string | null;
    platform: string;
    gitCommit: string | null;
  };
  artifacts: string[];
  stdoutTailBytes: number;
  stderrTailBytes: number;
}

export interface ProvenanceArtifactLinked extends ProvenanceEventBase {
  type: "artifact_linked";
  runId: string;
  experimentId: string | null;
  artifactPath: string;
  linkMethod: "explicit" | "mtime_inferred";
  mediaType: string | null;
  bytes: number | null;
}

export interface ProvenanceDownloadRecorded extends ProvenanceEventBase {
  type: "download_recorded";
  artifactPath: string;
  source: "paper-search-mcp" | "literature-ingest" | "manual";
  identifier: string | null;
  sourceUrl: string | null;
  bytes: number | null;
}

export type ProvenanceEvent =
  | ProvenanceRunRecorded
  | ProvenanceArtifactLinked
  | ProvenanceDownloadRecorded;

export function isProvenanceRunRecorded(e: ProvenanceEvent): e is ProvenanceRunRecorded {
  return e.type === "run_recorded";
}

export function isProvenanceArtifactLinked(e: ProvenanceEvent): e is ProvenanceArtifactLinked {
  return e.type === "artifact_linked";
}

export function normalizeArtifactPath(projectRel: string): string {
  return projectRel.replace(/\\/g, "/").replace(/^\.\/+/, "");
}
```

- [x] **Step 4: Run tests — PASS**

Run: `pnpm test tests/main/provenance-types.test.ts`

---

### Task 2: Provenance service — append + read

**Files:**
- Create: `src/main/services/provenance-service.ts`
- Create: `tests/main/provenance-service.test.ts`

- [x] **Step 1: Write failing service tests**

Create `tests/main/provenance-service.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendProvenanceEvent,
  readProvenanceEvents,
  resolveRunForArtifact,
} from "../../src/main/services/provenance-service";
import type { ProvenanceRunRecorded, ProvenanceArtifactLinked } from "../../src/shared/provenance";

describe("provenance-service", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "prism-prov-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("appends events to provenance.jsonl", () => {
    const run: ProvenanceRunRecorded = {
      id: "prov_1",
      schemaVersion: 1,
      type: "run_recorded",
      at: "2026-07-11T12:00:00.000Z",
      workspaceRel: "experiment",
      chatSessionId: null,
      gitBranch: null,
      gitCommit: null,
      experimentId: "exp-test",
      runId: "run_1",
      command: "echo hi",
      cwd: "experiment/exp-test",
      exitCode: 0,
      startedAt: "2026-07-11T12:00:00.000Z",
      finishedAt: "2026-07-11T12:00:01.000Z",
      env: { python: null, pythonVersion: null, platform: "darwin", gitCommit: null },
      artifacts: ["experiment/exp-test/out.txt"],
      stdoutTailBytes: 0,
      stderrTailBytes: 0,
    };
    appendProvenanceEvent(projectRoot, run);
    const link: ProvenanceArtifactLinked = {
      id: "prov_2",
      schemaVersion: 1,
      type: "artifact_linked",
      at: "2026-07-11T12:00:01.000Z",
      workspaceRel: "experiment",
      chatSessionId: null,
      gitBranch: null,
      gitCommit: null,
      runId: "run_1",
      experimentId: "exp-test",
      artifactPath: "experiment/exp-test/out.txt",
      linkMethod: "explicit",
      mediaType: "text/plain",
      bytes: null,
    };
    appendProvenanceEvent(projectRoot, link);

    const logPath = join(projectRoot, ".prismnext", "provenance.jsonl");
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(readProvenanceEvents(projectRoot)).toHaveLength(2);
  });

  it("resolveRunForArtifact finds run_recorded by artifact_linked", () => {
    // append run + link as above, then:
    appendProvenanceEvent(projectRoot, {
      id: "prov_1",
      schemaVersion: 1,
      type: "run_recorded",
      at: "2026-07-11T12:00:00.000Z",
      workspaceRel: "experiment",
      chatSessionId: "ses_x",
      gitBranch: null,
      gitCommit: null,
      experimentId: "exp-test",
      runId: "run_1",
      command: "python train.py",
      cwd: "experiment/exp-test",
      exitCode: 0,
      startedAt: "2026-07-11T12:00:00.000Z",
      finishedAt: "2026-07-11T12:00:05.000Z",
      env: { python: null, pythonVersion: null, platform: "darwin", gitCommit: null },
      artifacts: [],
      stdoutTailBytes: 0,
      stderrTailBytes: 0,
    });
    appendProvenanceEvent(projectRoot, {
      id: "prov_2",
      schemaVersion: 1,
      type: "artifact_linked",
      at: "2026-07-11T12:00:05.000Z",
      workspaceRel: "experiment",
      chatSessionId: "ses_x",
      gitBranch: null,
      gitCommit: null,
      runId: "run_1",
      experimentId: "exp-test",
      artifactPath: "experiment/exp-test/plot.png",
      linkMethod: "explicit",
      mediaType: "image/png",
      bytes: 1024,
    });

    const run = resolveRunForArtifact(projectRoot, "experiment/exp-test/plot.png");
    expect(run?.runId).toBe("run_1");
    expect(run?.command).toBe("python train.py");
    expect(run?.chatSessionId).toBe("ses_x");
  });
});
```

- [x] **Step 2: Run — expect FAIL**

Run: `pnpm test tests/main/provenance-service.test.ts`

- [x] **Step 3: Implement `provenance-service.ts`**

Create `src/main/services/provenance-service.ts` with:

```typescript
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  PROVENANCE_META_REL,
  PROVENANCE_REL,
  PROVENANCE_SCHEMA_VERSION,
  isProvenanceArtifactLinked,
  isProvenanceRunRecorded,
  normalizeArtifactPath,
  type ProvenanceArtifactLinked,
  type ProvenanceEvent,
  type ProvenanceRunRecorded,
} from "../../shared/provenance";
import type { ExperimentRunEntry } from "../../shared/experiment-log";
import type { ExperimentStorageContext } from "./experiment-log-service";

function provenancePath(projectRoot: string): string {
  return join(projectRoot.replace(/\\/g, "/"), PROVENANCE_REL);
}

function metaPath(projectRoot: string): string {
  return join(projectRoot.replace(/\\/g, "/"), PROVENANCE_META_REL);
}

export function generateProvenanceId(): string {
  return `prov_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export function readProvenanceEvents(projectRoot: string): ProvenanceEvent[] {
  const path = provenancePath(projectRoot);
  if (!existsSync(path)) return [];
  const out: ProvenanceEvent[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as ProvenanceEvent);
    } catch {
      // skip corrupt lines
    }
  }
  return out;
}

export function appendProvenanceEvent(projectRoot: string, event: ProvenanceEvent): void {
  const root = projectRoot.replace(/\\/g, "/");
  const dir = join(root, ".prismnext");
  mkdirSync(dir, { recursive: true });
  const path = provenancePath(root);
  appendFileSync(path, JSON.stringify(event) + "\n", "utf-8");
  try {
    writeFileSync(
      metaPath(root),
      JSON.stringify(
        { schemaVersion: PROVENANCE_SCHEMA_VERSION, lastEventId: event.id, lastAppendedAt: event.at },
        null,
        2,
      ),
      "utf-8",
    );
  } catch {
    // meta is optional cache
  }
}

export function resolveRunForArtifact(
  projectRoot: string,
  artifactPath: string,
): ProvenanceRunRecorded | null {
  const normalized = normalizeArtifactPath(artifactPath);
  const events = readProvenanceEvents(projectRoot);
  const link = [...events].reverse().find(
    (e): e is ProvenanceArtifactLinked =>
      isProvenanceArtifactLinked(e) && normalizeArtifactPath(e.artifactPath) === normalized,
  );
  if (!link) return null;
  const run = events.find(
    (e): e is ProvenanceRunRecorded =>
      isProvenanceRunRecorded(e) && e.runId === link.runId,
  );
  return run ?? null;
}

export function resolveRunById(projectRoot: string, runId: string): ProvenanceRunRecorded | null {
  const events = readProvenanceEvents(projectRoot);
  return (
    events.find((e): e is ProvenanceRunRecorded => isProvenanceRunRecorded(e) && e.runId === runId) ??
    null
  );
}

export interface RecordRunProvenanceOpts {
  ctx: ExperimentStorageContext;
  experimentId: string;
  run: ExperimentRunEntry;
  chatSessionId?: string | null;
  provenanceEventId?: string;
}

/** Mirror an experiment append_run into provenance.jsonl. Best-effort — never throws to caller. */
export function recordRunProvenance(projectRoot: string, opts: RecordRunProvenanceOpts): string | null {
  try {
    const eventId = opts.provenanceEventId ?? generateProvenanceId();
    const at = opts.run.finishedAt;
    const base = {
      workspaceRel: opts.ctx.workspaceRel,
      chatSessionId: opts.chatSessionId ?? null,
      gitBranch: null as string | null,
      gitCommit: opts.run.env?.gitCommit ?? null,
    };
    const runEvent: ProvenanceRunRecorded = {
      id: eventId,
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      type: "run_recorded",
      at,
      ...base,
      experimentId: opts.experimentId,
      runId: opts.run.runId,
      command: opts.run.command,
      cwd: opts.run.cwd,
      exitCode: opts.run.exitCode,
      startedAt: opts.run.startedAt,
      finishedAt: opts.run.finishedAt,
      env: {
        python: opts.run.env?.python ?? null,
        pythonVersion: opts.run.env?.pythonVersion ?? null,
        platform: opts.run.env?.platform ?? process.platform,
        gitCommit: opts.run.env?.gitCommit ?? null,
      },
      artifacts: opts.run.artifacts ?? [],
      stdoutTailBytes: opts.run.stdoutTail?.length ?? 0,
      stderrTailBytes: opts.run.stderrTail?.length ?? 0,
    };
    appendProvenanceEvent(projectRoot, runEvent);

    for (const artifactPath of opts.run.artifacts ?? []) {
      const link: ProvenanceArtifactLinked = {
        id: generateProvenanceId(),
        schemaVersion: PROVENANCE_SCHEMA_VERSION,
        type: "artifact_linked",
        at,
        ...base,
        runId: opts.run.runId,
        experimentId: opts.experimentId,
        artifactPath: normalizeArtifactPath(artifactPath),
        linkMethod: "explicit",
        mediaType: null,
        bytes: null,
      };
      appendProvenanceEvent(projectRoot, link);
    }
    return eventId;
  } catch {
    return null;
  }
}
```

Fix import: use `import { writeFileSync } from "node:fs"` at top instead of dynamic require hack.

- [x] **Step 4: Run tests — PASS**

Run: `pnpm test tests/main/provenance-service.test.ts`

---

### Task 3: Hook `appendRun` + optional run fields

**Files:**
- Modify: `src/shared/experiment-log.ts`
- Modify: `src/main/services/experiment-log-service.ts`
- Modify: `src/main/services/experiment-log-bridge.ts`

- [x] **Step 1: Extend `ExperimentRunEntry` (optional fields)**

In `src/shared/experiment-log.ts`:

```typescript
export interface ExperimentRunEntry {
  // ... existing fields ...
  /** OpenCode chat tab that triggered the run (optional). */
  chatSessionId?: string | null;
  /** Links into provenance.jsonl run_recorded event (optional). */
  provenanceEventId?: string | null;
}
```

- [x] **Step 2: Extend `appendRun` signature**

Add optional trailing context param to avoid breaking callers:

```typescript
export function appendRun(
  ctx: ExperimentStorageContext,
  id: string,
  input: ExperimentRunInput,
  context?: { chatSessionId?: string | null },
): { ok: true; run: ExperimentRunEntry; path: string } | { ok: false; error: string } {
```

After building `run` object and before `appendFileSync`:

```typescript
  if (context?.chatSessionId) {
    run.chatSessionId = context.chatSessionId;
  }
```

After successful `appendFileSync`:

```typescript
  const provId = generateProvenanceId();
  const recorded = recordRunProvenance(ctx.projectRoot, {
    ctx,
    experimentId: id,
    run,
    chatSessionId: context?.chatSessionId ?? null,
    provenanceEventId: provId,
  });
  if (recorded) {
    run.provenanceEventId = recorded;
    // Optional: rewrite last line with enriched run — YAGNI for v1; provenance is authoritative for provId
  }
```

Prefer static import at file top: `import { recordRunProvenance, generateProvenanceId } from "./provenance-service";`

- [x] **Step 3: Pass sessionId from bridge**

In `experiment-log-bridge.ts`, `append_run` dispatch:

```typescript
const sessionId = req.sessionId ?? basename(sessionDir);
// ...
appendRun(ctx, id, runInput, { chatSessionId: sessionId });
```

Locate `append_run` case and thread `sessionId` from request (already on `ExperimentLogBridgeRequest`).

- [x] **Step 4: Run experiment tests**

Run: `pnpm test tests/main/experiment-log-service.test.ts`

Expected: PASS (existing tests ignore new optional fields)

---

### Task 4: IPC + preload

**Files:**
- Create: `src/main/ipc/provenance.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`

- [x] **Step 1: Create IPC handlers**

`src/main/ipc/provenance.ts`:

```typescript
import { ipcMain } from "electron";
import { resolveRunById, resolveRunForArtifact } from "../services/provenance-service";

export function registerProvenanceHandlers(): void {
  ipcMain.handle(
    "provenance:getForArtifact",
    async (_event, args: { projectRoot: string; artifactPath: string }) => {
      const run = resolveRunForArtifact(args.projectRoot, args.artifactPath);
      return { ok: true as const, run };
    },
  );

  ipcMain.handle(
    "provenance:getForRun",
    async (_event, args: { projectRoot: string; runId: string }) => {
      const run = resolveRunById(args.projectRoot, args.runId);
      return { ok: true as const, run };
    },
  );
}
```

Register in `src/main/ipc/index.ts`: `registerProvenanceHandlers();`

- [x] **Step 2: Preload surface**

In `src/preload/index.ts`:

```typescript
provenanceGetForArtifact: (projectRoot: string, artifactPath: string) =>
  ipcRenderer.invoke("provenance:getForArtifact", { projectRoot, artifactPath }),
provenanceGetForRun: (projectRoot: string, runId: string) =>
  ipcRenderer.invoke("provenance:getForRun", { projectRoot, runId }),
```

Add matching types to `electron.d.ts` returning `{ ok: true; run: ProvenanceRunRecorded | null }`.

Import `ProvenanceRunRecorded` type in electron.d.ts or inline a renderer-safe subset.

- [x] **Step 3: Typecheck**

Run: `pnpm typecheck`

---

### Task 5: Experiments UI — provenance inspector

**Files:**
- Create: `src/renderer/modes/experiments-mode/experiments-provenance-inspector.tsx`
- Modify: `src/renderer/modes/experiments-mode/experiments-runs-table.tsx`

- [x] **Step 1: Create inspector component**

`experiments-provenance-inspector.tsx` — props: `{ projectRoot, artifactPath, onClose }`.

On mount: `window.electronAPI.provenanceGetForArtifact(projectRoot, artifactPath)`.

Display:
- Command (monospace, copy button)
- Exit code, startedAt → finishedAt duration
- env: python, platform, gitCommit (reuse `experimentEnvDisplayRows` pattern)
- chatSessionId with honest empty state
- Buttons: «Open in Files» (reuse ArtifactChip navigation logic), «Close»

Empty state when `run === null`:

> No run recorded for this file — it may have been copied manually.

- [x] **Step 2: Wire ArtifactChip**

Change `ArtifactChip` in `experiments-runs-table.tsx`:

- Add optional `onInspect?: (path: string) => void`
- On **secondary** action or **modifier+click** (choose one — recommend **context menu "View provenance"** or split button):

Simplest v1: add small «info» icon button next to chip that calls `onInspect(path)`.

Parent `RunRow` holds state:

```typescript
const [inspectPath, setInspectPath] = useState<string | null>(null);
```

Render `ExperimentsProvenanceInspector` when `inspectPath` set.

Pass `projectRoot` from experiments mode parent (already has `projectRoot` via document store).

- [x] **Step 3: Manual UI test**

Run experiment with `artifacts: ["results/plot.png"]` → expand run → click provenance on chip → inspector shows command.

---

### Task 6: Experiments module one-liner

**Files:**
- Modify: `src/main/prompts/modules/experiments.ts`

- [x] **Step 1: Add artifacts discipline**

In workflow section, add:

```typescript
  "- After `experiment-run`, list output file paths in `artifacts` so provenance links survive in the Experiments UI.",
```

- [x] **Step 2: Run module test if exists**

Run: `pnpm test tests/main/experiments-module.test.ts` (create minimal test if missing).

---

### Task 7 (Phase 1.1): `download_recorded` on literature ingest

**Files:**
- Modify: `src/main/ipc/literature.ts` (or literature service where ingestPdf completes)

- [x] **Step 1: After successful PDF write, append provenance**

```typescript
import { appendProvenanceEvent, generateProvenanceId } from "../services/provenance-service";
import type { ProvenanceDownloadRecorded } from "../../shared/provenance";

// After ingest succeeds:
const event: ProvenanceDownloadRecorded = {
  id: generateProvenanceId(),
  schemaVersion: 1,
  type: "download_recorded",
  at: new Date().toISOString(),
  workspaceRel: ".",
  chatSessionId: null,
  gitBranch: null,
  gitCommit: null,
  artifactPath: normalizeArtifactPath(relativePdfPath),
  source: "literature-ingest",
  identifier: paper.doi ?? paper.arxivId ?? null,
  sourceUrl: null,
  bytes: fileSize,
};
appendProvenanceEvent(projectRoot, event);
```

- [x] **Step 2: Test with literature ingest test if present**

Run targeted literature IPC tests.

---

### Task 8: Verification + manual E2E

- [x] **Step 1: Full test suite**

Run: `pnpm test && pnpm typecheck`

- [x] **Step 2: Manual E2E**

1. Open project with Experiment folder configured  
2. Create experiment, run command with artifact path in UI or via agent `experiment-run`  
3. Verify `.prismnext/provenance.jsonl` has `run_recorded` + `artifact_linked`  
4. Experiments UI → provenance inspector shows command  
5. Re-open old project without provenance file → first run creates file without error  

- [x] **Step 3: Update plan status to ✅**

---

## Spec coverage self-review

| Spec § | Task |
|--------|------|
| §3 Storage layout | Task 2 |
| §4 Schema | Task 1 |
| §5 ExperimentRunEntry extension | Task 3 |
| §6 Write paths | Task 3, 7 |
| §7 UI | Task 5 |
| §8 Agent module | Task 6 |
| §10 Acceptance | Task 8 |
| mtime inference (§4.3 P1.1) | **Deferred** — explicit artifacts only in v1 |
| staging_recorded | **Deferred** Phase 2 |
| listRecent IPC | **Deferred** Phase 1.5 |

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-11-provenance-lite-plan.md`.

**Start after:** paper-search-mcp manual E2E (Task 11) **or** parallelize Task 1–4 if another engineer owns UI.

**Execution options:**

1. **Subagent-Driven** — Task 1 → 2 → 3 → 4 → 5 sequentially (5 depends on 4)  
2. **Inline Execution** — implement in one session with checkpoint after Task 3 (backend complete)

# Literature AI Metadata & Tag Canonicalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After PDF/HTML extract completes, optionally generate a one-sentence AI summary and keywords merged into unified tags; enforce library-wide tag identity (`test` = `Test` = `1-test` = `1 test`).

**Architecture:** Phase 1 extends `src/shared/paper-tags.ts` with `paperTagKey` + `resolvePaperTagDisplay`, migrates `library.db` to schema v9, and updates renderer tag paths. Phase 2 adds heuristic abstract/keyword parsing from extract artifacts, a main-process LLM HTTP client (not OpenCode), an async queue hooked from `literature-extract-queue`, Settings toggle, IPC, and entry-panel Summary row.

**Tech Stack:** TypeScript, better-sqlite3, Vitest, Electron IPC, existing extract pipeline (MinerU/pdfjs/html), settings store.

**Spec:** [`docs/superpowers/specs/2026-07-02-literature-ai-metadata-and-tag-canonicalization-design.md`](../specs/2026-07-02-literature-ai-metadata-and-tag-canonicalization-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/shared/paper-tags.ts` | Canonical key, display resolve, tag list normalize |
| `src/shared/literature-ai-metadata.ts` | Fingerprint hash, LLM JSON types, prompt constants |
| `src/main/services/literature-service.ts` | Schema v9, columns, tag migration, `mapPaperForRenderer` |
| `src/main/services/literature-ai-metadata-heuristics.ts` | Abstract/keywords from md + MinerU blocks (no LLM) |
| `src/main/services/provider-chat.ts` | OpenAI-compatible chat completion HTTP (shared by AI metadata) |
| `src/main/services/literature-ai-metadata.ts` | Orchestrate heuristics + LLM + DB patch |
| `src/main/services/literature-ai-metadata-queue.ts` | Async worker (max 2 concurrent) |
| `src/main/services/literature-extract-queue.ts` | Call `maybeEnqueueAiMetadata` on `ready` |
| `src/main/services/settings.ts` | `literatureAutoAiMetadata` default `false` |
| `src/main/ipc/literature.ts` | `literature:regenerateAiMetadata` |
| `src/preload/index.ts` + `src/renderer/types/electron.d.ts` | Typed surface + event |
| `src/renderer/lib/literature/paper-tag-utils.ts` | Key-based collect/filter |
| `src/renderer/modes/literature-mode/literature-paper-user-tags.tsx` | Pass project tags into resolve on add |
| `src/renderer/components/modules/settings/literature-settings.tsx` | Switch UI |
| `src/renderer/modes/literature-mode/literature-entry-panel.tsx` | Summary row + regenerate |
| `src/renderer/stores/literature-store.ts` | Subscribe `literature:aiMetadataChanged` |
| `tests/shared/paper-tags.test.ts` | Key matrix + resolve display |
| `tests/main/literature-ai-metadata-heuristics.test.ts` | Regex/block fixtures |
| `tests/main/literature-ai-metadata.test.ts` | Merge + fingerprint (mock fetch) |
| `tests/main/literature-tag-migration.test.ts` | v8→v9 tag dedupe |

---

## Phase 1 — Tag canonicalization (ship first; no LLM)

### Task 1: `paperTagKey` + table-driven tests

**Files:**
- Modify: `src/shared/paper-tags.ts`
- Modify: `tests/shared/paper-tags.test.ts`

- [ ] **Step 1: Add failing tests**

Add to `tests/shared/paper-tags.test.ts`:

```ts
import { paperTagKey, resolvePaperTagDisplay, normalizePaperTagsWithCatalog } from "../../src/shared/paper-tags";

describe("paperTagKey", () => {
  it.each([
    ["test", "Test"],
    ["test", "TEST"],
    ["1-test", "1 test"],
    ["1-test", "1_test"],
    ["world model", "World Model"],
    ["world model", "world-model"],
    ["gpt-4", "gpt-4"],
  ])('"%s" equals "%s"', (a, b) => {
    expect(paperTagKey(a)).toBe(paperTagKey(b));
  });

  it.each([
    ["llm", "llms"],
    ["gpt-4", "gpt 4"],
  ])('"%s" differs from "%s"', (a, b) => {
    expect(paperTagKey(a)).not.toBe(paperTagKey(b));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd prism-next && pnpm test tests/shared/paper-tags.test.ts
```

- [ ] **Step 3: Implement `paperTagKey` in `src/shared/paper-tags.ts`**

```ts
const EDGE_PUNCT = /^[.,;:!?'"\`[\](){}]+|[.,;:!?'"\`[\](){}]+$/g;

/** Normalize separators: _/\ → space; keep hyphen between alnum (gpt-4). */
function normalizeTagSeparators(s: string): string {
  const protectedHyphen = "\u0000";
  const withMarkers = s.replace(/(?<=[a-z0-9])-(?=[a-z0-9])/gi, protectedHyphen);
  const spaced = withMarkers.replace(/[-_/\\]+/g, " ");
  return spaced.split(protectedHyphen).join("-");
}

export function paperTagKey(raw: string): string {
  let s = raw.normalize("NFKC").trim();
  s = normalizeTagSeparators(s);
  s = s.toLowerCase().replace(/\s+/g, " ").trim();
  s = s.replace(EDGE_PUNCT, "").trim();
  return s;
}

export function isValidPaperTagKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_PAPER_TAG_LENGTH;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/shared/paper-tags.ts tests/shared/paper-tags.test.ts
git commit -m "feat(literature): add paperTagKey canonical identity"
```

---

### Task 2: `resolvePaperTagDisplay` + `normalizePaperTagsWithCatalog`

**Files:**
- Modify: `src/shared/paper-tags.ts`
- Modify: `tests/shared/paper-tags.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe("resolvePaperTagDisplay", () => {
  it("reuses existing project display for same key", () => {
    const catalog = ["World Model", "LLM"];
    expect(resolvePaperTagDisplay("world model", catalog)).toBe("World Model");
    expect(resolvePaperTagDisplay("world-model", catalog)).toBe("World Model");
  });

  it("uses normalized display for new keys", () => {
    expect(resolvePaperTagDisplay("New Topic", [])).toBe("New Topic");
  });
});

describe("normalizePaperTagsWithCatalog", () => {
  it("dedupes by key and respects catalog display", () => {
    const out = normalizePaperTagsWithCatalog(
      ["To Read", "to-read", "LLM"],
      ["To Read"],
    );
    expect(out).toEqual(["To Read", "LLM"]);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Update `normalizePaperTag` to reject when `!isValidPaperTagKey(paperTagKey(...))`.

```ts
export function resolvePaperTagDisplay(
  raw: string,
  existingProjectTags: readonly string[],
): string | null {
  const key = paperTagKey(raw);
  if (!isValidPaperTagKey(key)) return null;
  for (const existing of existingProjectTags) {
    if (paperTagKey(existing) === key) return normalizePaperTag(existing) ?? existing;
  }
  return normalizePaperTag(raw);
}

export function normalizePaperTagsWithCatalog(
  tags: readonly string[],
  existingProjectTags: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const display = resolvePaperTagDisplay(raw, [...existingProjectTags, ...out]);
    if (!display) continue;
    const key = paperTagKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
    if (out.length >= MAX_PAPER_TAGS_PER_PAPER) break;
  }
  return out;
}

/** Back-compat: per-paper only (no catalog). Prefer WithCatalog at write boundaries. */
export function normalizePaperTags(tags: readonly string[]): string[] {
  return normalizePaperTagsWithCatalog(tags, []);
}
```

Keep `parsePaperTagsJson` / `serializePaperTagsJson` calling `normalizePaperTags` (migration will rewrite with catalog).

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

---

### Task 3: Renderer tag utils + add path use catalog

**Files:**
- Modify: `src/renderer/lib/literature/paper-tag-utils.ts`
- Modify: `src/renderer/modes/literature-mode/literature-paper-user-tags.tsx`
- Modify: `tests/renderer/paper-tag-utils.test.ts`

- [ ] **Step 1: Update `collectProjectTags` to bucket by `paperTagKey`**

```ts
import { paperTagKey } from "../../../shared/paper-tags";

export function collectProjectTags(papers: Array<{ tags?: string[] }>): ProjectTagEntry[] {
  const byKey = new Map<string, ProjectTagEntry>();
  for (const paper of papers) {
    for (const tag of paper.tags ?? []) {
      const key = paperTagKey(tag);
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(key, { tag, count: 1 });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}
```

- [ ] **Step 2: In `literature-paper-user-tags.tsx`, resolve on add**

Replace direct `normalizePaperTag` with:

```ts
import { resolvePaperTagDisplay, normalizePaperTagsWithCatalog } from "../../../shared/paper-tags";

const projectTagList = useMemo(
  () => collectProjectTags(papers).map((e) => e.tag),
  [papers],
);

// addTag:
const tag = resolvePaperTagDisplay(raw, projectTagList);

// persistTags:
await updatePaper(projectRoot, paperId, {
  tags: normalizePaperTagsWithCatalog(next, projectTagList),
}, { silent: true });
```

- [ ] **Step 3: Extend `tests/renderer/paper-tag-utils.test.ts`** — two papers `Test` + `test` → count 2, single entry display `Test` (first seen in sort order — document behavior).

- [ ] **Step 4: Run**

```bash
pnpm test tests/renderer/paper-tag-utils.test.ts tests/shared/paper-tags.test.ts
```

- [ ] **Step 5: Commit**

---

### Task 4: Schema v9 + library-wide tag migration

**Files:**
- Modify: `src/main/services/literature-service.ts`
- Create: `tests/main/literature-tag-migration.test.ts`

- [ ] **Step 1: Failing migration test**

```ts
it("migrates v8 tags to canonical display across papers", () => {
  const root = tempProject();
  const a = createPaper(root, { title: "A" });
  const b = createPaper(root, { title: "B" });
  updatePaper(root, a.paper.id, { tags: ["Test"] });
  updatePaper(root, b.paper.id, { tags: ["test"] });
  // force reopen db → migration
  expect(mapPaperForRenderer(getPaper(root, a.paper.id)!).tags).toEqual(["Test"]);
  expect(mapPaperForRenderer(getPaper(root, b.paper.id)!).tags).toEqual(["Test"]);
});
```

- [ ] **Step 2: Bump `CURRENT_SCHEMA_VERSION` to `9`**

Add migration block after v8 tags column:

```ts
function migrateTagsToCanonical(projectRoot: string, db: LibraryDb): void {
  const rows = db.prepare("SELECT id, tags FROM papers WHERE tags IS NOT NULL AND tags != ''").all() as {
    id: string;
    tags: string;
  }[];
  const allRaw: string[] = [];
  for (const row of rows) {
    allRaw.push(...parsePaperTagsJson(row.tags));
  }
  // first-seen display per key (stable order: sorted raw unique keys by first appearance)
  const catalog: string[] = [];
  const seenKeys = new Set<string>();
  for (const raw of allRaw) {
    const key = paperTagKey(raw);
    if (!isValidPaperTagKey(key) || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const display = normalizePaperTag(raw);
    if (display) catalog.push(display);
  }
  const update = db.prepare("UPDATE papers SET tags = ? WHERE id = ?");
  for (const row of rows) {
    const parsed = parsePaperTagsJson(row.tags);
    const normalized = normalizePaperTagsWithCatalog(parsed, catalog);
    update.run(serializePaperTagsJson(normalized), row.id);
  }
}
```

Call `migrateTagsToCanonical` inside schema migration to v9 (before bumping version write).

Also add columns in fresh schema + ALTER for upgrades:

```sql
ALTER TABLE papers ADD COLUMN ai_summary TEXT;
ALTER TABLE papers ADD COLUMN ai_metadata_at INTEGER;
ALTER TABLE papers ADD COLUMN ai_metadata_sha TEXT;
```

```sql
CREATE TABLE IF NOT EXISTS paper_ai_metadata (
  paper_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  error TEXT,
  model TEXT,
  queued_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);
```

Extend `PaperRow`, `PaperUpdateInput`, `mapPaperForRenderer`:

```ts
ai_summary: string | null;
ai_metadata_at: number | null;
ai_metadata_sha: string | null;
// join or separate query for ai metadata status — add getPaperAiMetadataStatus(paperId)
```

- [ ] **Step 3: Run migration test — PASS**

- [ ] **Step 4: Commit**

---

## Phase 2 — AI metadata pipeline

### Task 5: Shared fingerprint + prompt types

**Files:**
- Create: `src/shared/literature-ai-metadata.ts`
- Create: `tests/shared/literature-ai-metadata.test.ts`

- [ ] **Step 1: Test fingerprint stability**

```ts
import { createHash } from "node:crypto";
import { aiMetadataFingerprint } from "../../src/shared/literature-ai-metadata";

it("fingerprint changes when abstract or pdf_sha changes", () => {
  const a = aiMetadataFingerprint({ abstractText: "foo", pdfSha: "abc", model: "openai/gpt-4o-mini" });
  const b = aiMetadataFingerprint({ abstractText: "bar", pdfSha: "abc", model: "openai/gpt-4o-mini" });
  expect(a).not.toBe(b);
});
```

- [ ] **Step 2: Implement**

```ts
import { createHash } from "node:crypto";

export type AiMetadataLlmResult = {
  summary: string;
  keywords: string[];
};

export const AI_METADATA_KEYWORD_MIN = 3;
export const AI_METADATA_KEYWORD_MAX = 6;

export function aiMetadataFingerprint(input: {
  abstractText: string;
  pdfSha: string | null;
  model: string;
}): string {
  const payload = `${input.model}\n${input.pdfSha ?? ""}\n${input.abstractText.trim()}`;
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 32);
}

export function buildAiMetadataPrompt(title: string, abstractText: string, keywordHints: string[]): string {
  const hints =
    keywordHints.length > 0 ? `\nOptional keyword hints from PDF: ${keywordHints.join(", ")}` : "";
  return `You analyze academic paper metadata. Reply with JSON only, no markdown fences.

Title: ${title}

Abstract:
${abstractText.slice(0, 6000)}${hints}

Return:
{"summary":"One plain sentence, max 120 characters, no markdown.","keywords":["3 to 6 short noun phrases"]}`;
}
```

- [ ] **Step 3: Run test — PASS; commit**

---

### Task 6: Heuristic abstract + keywords from extract

**Files:**
- Create: `src/main/services/literature-ai-metadata-heuristics.ts`
- Create: `tests/main/literature-ai-metadata-heuristics.test.ts`

- [ ] **Step 1: Fixture tests**

```ts
import { extractAbstractFromMarkdown, extractKeywordHintsFromText } from "../../src/main/services/literature-ai-metadata-heuristics";

const SAMPLE = `
# Paper

Abstract
This paper studies world models for control.

Keywords: reinforcement learning, world models, planning
Introduction
Lorem ipsum
`;

it("extracts abstract section", () => {
  expect(extractAbstractFromMarkdown(SAMPLE)).toContain("world models");
});

it("extracts keyword hints", () => {
  expect(extractKeywordHintsFromText(SAMPLE)).toEqual(
    expect.arrayContaining(["reinforcement learning", "world models"]),
  );
});
```

- [ ] **Step 2: Implement**

```ts
const ABSTRACT_START = /^(abstract|summary|摘要)\s*$/im;
const ABSTRACT_STOP = /^(keywords?|key words|index terms|introduction|\d+\.?\s+introduction)\s*$/im;
const KEYWORDS_LINE = /^(keywords?|key words|index terms)\s*[:：]\s*(.+)$/im;

export function extractAbstractFromMarkdown(md: string): string | null {
  const lines = md.replace(/\r/g, "").split("\n");
  let capturing = false;
  const buf: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!capturing && ABSTRACT_START.test(t)) {
      capturing = true;
      continue;
    }
    if (capturing && ABSTRACT_STOP.test(t)) break;
    if (capturing && t) buf.push(t);
  }
  const text = buf.join(" ").trim();
  return text.length >= 40 ? text : null;
}

export function extractKeywordHintsFromText(text: string): string[] {
  const match = text.match(KEYWORDS_LINE);
  if (!match?.[2]) return [];
  return match[2]
    .split(/[,;|·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, AI_METADATA_KEYWORD_MAX);
}
```

Add `loadBestExtractMarkdown(projectRoot, paperId)` helper: read `paper-extract-db` for best ready source (mineru > pdfjs > html), read md file from disk.

Add `extractAbstractFromMineruBlocks(blocksJsonPath)` if blocks JSON stores original MinerU type — grep `mineru-blocks` for `abstract` type preservation in meta; if only mapped to `text`, rely on markdown heuristic for v1.

- [ ] **Step 3: Run tests — PASS; commit**

---

### Task 7: Provider chat HTTP client

**Files:**
- Create: `src/main/services/provider-chat.ts`
- Create: `tests/main/provider-chat.test.ts` (mock `global.fetch`)

- [ ] **Step 1: Export `completeChatJson`**

```ts
export async function completeChatJson(opts: {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<string> {
  // OpenAI-compatible POST {base}/v1/chat/completions
  // messages: [{ role: "user", content: prompt }]
  // response_format: { type: "json_object" } when supported (openai/openrouter/deepseek)
  // Anthropic: use messages API with system "JSON only" — branch on provider
  // Parse choices[0].message.content string
}
```

Extract endpoint/header map from `src/main/acp/service.ts` `testConnection` into shared constants to avoid drift.

- [ ] **Step 2: Unit test with mocked fetch returning `{"summary":"...","keywords":["a"]}`**

- [ ] **Step 3: Commit**

---

### Task 8: `literature-ai-metadata.ts` orchestrator

**Files:**
- Create: `src/main/services/literature-ai-metadata.ts`
- Create: `tests/main/literature-ai-metadata.test.ts`

- [ ] **Step 1: Test merge policy (mock LLM)**

```ts
vi.mock("../../src/main/services/provider-chat", () => ({
  completeChatJson: vi.fn().mockResolvedValue(
    JSON.stringify({ summary: "A short summary.", keywords: ["to-read", "LLM"] }),
  ),
}));
```

Paper tags `["To Read"]`, project has `To Read` → after run tags `["To Read", "LLM"]`, `ai_summary` set, abstract unchanged if already present.

- [ ] **Step 2: Implement `runAiMetadataForPaper(projectRoot, paperId, { force?: boolean })`**

Flow:
1. Load paper + settings; resolve model from `literatureAiMetadataModel` or chat default.
2. If `!force` && fingerprint matches `paper.ai_metadata_sha` → return `skipped`.
3. Heuristic abstract from extract; `abstractForLlm = paper.abstract ?? heuristicAbstract`.
4. If no `abstractForLlm` → status `skipped`, exit (no tokens).
5. If `!paper.abstract && heuristicAbstract` → patch abstract only (does not touch enrich abstract rule).
6. LLM call → parse JSON → validate summary length ≤ 200, keywords 1–6.
7. `existingProjectTags = listPapers → collect all tag displays` (main-side helper mirroring renderer util).
8. Merge keywords with `normalizePaperTagsWithCatalog([...existingTags, ...keywords], catalog)`.
9. Update paper: `ai_summary`, `ai_metadata_at`, `ai_metadata_sha`, `tags`, optional `abstract`.
10. Upsert `paper_ai_metadata` status `ready`.

Export `collectProjectTagDisplays(projectRoot: string): string[]` in literature-service or shared util used by main.

- [ ] **Step 3: Run tests — PASS; commit**

---

### Task 9: Async queue + extract hook

**Files:**
- Create: `src/main/services/literature-ai-metadata-queue.ts`
- Modify: `src/main/services/literature-extract-queue.ts`
- Modify: `src/main/services/settings.ts`
- Modify: `src/renderer/stores/settings-store.ts`

- [ ] **Step 1: Queue pattern (mirror extract queue)**

```ts
const MAX_CONCURRENT = 2;
const pending: Array<{ projectRoot: string; paperId: string; force: boolean }> = [];

export function maybeEnqueueAiMetadata(projectRoot: string, paperId: string): void {
  if (!getSettings().literatureAutoAiMetadata) return;
  enqueueAiMetadata(projectRoot, paperId, { force: false });
}

export function enqueueAiMetadata(projectRoot: string, paperId: string, opts: { force: boolean }): void {
  // dedupe pending/running; upsert paper_ai_metadata status queued; broadcast event
}
```

Worker calls `runAiMetadataForPaper`, broadcasts `literature:aiMetadataChanged` via `BrowserWindow.getAllWindows()`.

- [ ] **Step 2: In `literature-extract-queue.ts` `broadcastState`, when `state.status === "ready"`:**

```ts
import { maybeEnqueueAiMetadata } from "./literature-ai-metadata-queue";
// inside ready branch:
maybeEnqueueAiMetadata(projectRoot, state.paperId);
```

- [ ] **Step 3: Add settings default**

`src/main/services/settings.ts`:

```ts
literatureAutoAiMetadata: false,
```

Mirror in `settings-store.ts` types.

- [ ] **Step 4: Manual smoke — no automated test required; commit**

---

### Task 10: IPC, preload, store refresh

**Files:**
- Modify: `src/main/ipc/literature.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Modify: `src/renderer/stores/literature-store.ts`

- [ ] **Step 1: Handler**

```ts
ipcMain.handle(
  "literature:regenerateAiMetadata",
  async (_e, args: { projectRoot: string; paperId: string }) => {
    enqueueAiMetadata(args.projectRoot, args.paperId, { force: true });
    return { ok: true };
  },
);
```

- [ ] **Step 2: Preload + types**

```ts
literatureRegenerateAiMetadata: (projectRoot: string, paperId: string) => ipcRenderer.invoke(...);
onLiteratureAiMetadataChanged: (cb) => { ipcRenderer.on("literature:aiMetadataChanged", ...); return () => ... };
```

- [ ] **Step 3: Store subscription** — on event, `refreshPapers(projectRoot)` or patch single paper via `literature:getPaper`.

- [ ] **Step 4: Commit**

---

### Task 11: Settings UI switch

**Files:**
- Modify: `src/renderer/components/modules/settings/literature-settings.tsx`

- [ ] **Step 1: Add row below Auto-extract**

```tsx
<div className={ROW}>
  <div>
    <p className={ROW_LABEL}>Auto-generate summary & keywords</p>
    <p className={ROW_DESC}>
      After PDF text extraction, use your configured AI model to write a one-sentence summary
      and add keywords to Tags. Uses a small amount of tokens per paper.
    </p>
  </div>
  <Switch
    checked={Boolean(settings.literatureAutoAiMetadata)}
    onCheckedChange={(checked) => updateSettings({ literatureAutoAiMetadata: checked })}
  />
</div>
```

Optional: disable switch when no `settings.aiApiKeys` entry — read from settings store shape used elsewhere in AI settings.

- [ ] **Step 2: Commit**

---

### Task 12: Entry panel Summary + regenerate

**Files:**
- Modify: `src/renderer/modes/literature-mode/literature-entry-panel.tsx`
- Optional: `src/renderer/modes/literature-mode/literature-ai-metadata-badge.tsx`

- [ ] **Step 1: Add MetadataRow above Abstract**

```tsx
<MetadataRow label="Summary">
  {paper.aiMetadataStatus === "running" || paper.aiMetadataStatus === "queued" ? (
    <span className="text-[length:var(--font-size-13)] text-muted-foreground italic">Generating…</span>
  ) : paper.aiSummary ? (
    <p className="text-[length:var(--font-size-13)] italic text-muted-foreground leading-relaxed px-1 -mx-1">
      {paper.aiSummary}
    </p>
  ) : (
    <p className={cn(SETTINGS_ROW_DESC, "px-1 -mx-1")}>No summary yet</p>
  )}
</MetadataRow>
```

- [ ] **Step 2: Add regenerate to paper overflow menu** (same area as extract actions in `literature-pdf-action-menu.tsx` or entry panel kebab):

```tsx
onSelect={() => void window.electronAPI.literatureRegenerateAiMetadata(projectRoot, paper.id)}
```

Label: **Regenerate summary & keywords**

- [ ] **Step 3: Failed status tooltip** near extract badge — `AI !` with `paper.aiMetadataError`.

- [ ] **Step 4: Commit**

---

### Task 13: Final verification

- [ ] **Run full test suite**

```bash
cd prism-next && pnpm test
```

- [ ] **Typecheck**

```bash
cd prism-next && npx tsc --noEmit
```

- [ ] **Manual checklist**
  1. Import PDF with auto-extract + auto-AI on → extract badge ready → summary + tags appear.
  2. Paper with Zotero abstract → abstract unchanged, summary generated from it.
  3. Add tag `test` on paper A, `Test` on paper B → migration/show single filter entry.
  4. Toggle off → extract ready does not enqueue AI.
  5. Regenerate → append-only tags preserved.

- [ ] **Update spec status** to `Implementing` / check acceptance boxes in spec when done.

---

## Phase 3 — Deferred (v1.1, not in this plan)

- `literatureAiMetadataModel` picker in Settings
- `literature-bridge` expose `ai_summary` + parsed `tags[]`
- Anthropic native JSON mode polish if OpenAI-compat shim insufficient

---

## Spec coverage checklist

| Spec § | Task |
|--------|------|
| 3 Tag canonicalization | Tasks 1–4 |
| 3.6 Migration | Task 4 |
| 4 AI metadata fields | Task 4 |
| 5 Pipeline | Tasks 5–9 |
| 6 Settings | Tasks 9, 11 |
| 7 Entry panel UI | Task 12 |
| 8 IPC | Task 10 |
| 9 Agent exposure | Phase 3 deferred |
| 11 Testing | All test steps |
| 13 Acceptance | Task 13 |

---

## Suggested commit sequence

1. `feat(literature): canonical paperTagKey`
2. `feat(literature): resolve tag display from project catalog`
3. `feat(literature): schema v9 tag migration + ai metadata columns`
4. `feat(literature): heuristic abstract/keyword extraction`
5. `feat(literature): provider chat client for metadata`
6. `feat(literature): AI metadata orchestrator + queue`
7. `feat(literature): settings + IPC + entry panel summary`

# Chat Artifact Block — design

Date: 2026-07-18

## Goal

AI replies need a **single, extensible container** for project result files (experiment outputs and any other project-relative files the agent surfaces).

Today only **images** have a first-class inline experience (`ChatProjectImage` + markdown `![](path)`). Other artifacts appear as bare paths or tool-card chips. Experiments already treat `artifacts` as **any result file**, not images only — the chat UI should match that contract.

## Decisions (approved direction)

1. **Primary**: explicit syntax in assistant prose (Agent-controlled).
2. **Secondary**: narrow auto-fallback when the same assistant turn has experiment tool results with `artifacts[]` that were not already embedded (same spirit as today’s figure fallback).
3. **Architecture**: one shell (`ChatArtifactBlock`); **image is a renderer specialization**, not a separate system. Future: PDF / HTML / spreadsheet / Word renderers plug into the same shell.

## Non-goals (Phase 1)

- Full in-chat editors for Word / Excel / PDF annotation
- Auto-injecting every artifact from every tool across the whole session
- Changing `runs.jsonl` / provenance schema (already path-based; snapshots remain image-only for figure freeze)
- Replacing Experiments History chips (may later share the same open/preview helpers)

## Concepts

| Term | Meaning |
|------|---------|
| **Artifact** | Any project-relative result file the agent or run recorded (csv, json, png, pdf, …) |
| **Shell** | Shared chrome: type badge, title, path, actions (Open in Files, optional provenance) |
| **Renderer** | Type-specific body inside the shell (image preview, table peek, “open file”, …) |
| **Explicit embed** | Agent writes syntax → one block in the reply stream |
| **Auto fallback** | UI appends blocks for missing experiment `artifacts` after the turn’s prose |

```text
ChatArtifactBlock (shell)
├── kind: image     → existing padded frame + click-to-enlarge (ChatProjectImage / preview dialog)
├── kind: generic   → Phase 1 default for non-images (icon + path + Open)
├── kind: pdf       → Phase 2+
├── kind: table     → Phase 2+ (csv / xlsx peek)
├── kind: html      → Phase 2+
└── kind: document  → Phase 2+ (docx, …)
```

## Explicit syntax

### Chosen form (Phase 1)

Use a **fenced directive** that is easy to teach in prompts and easy to parse without colliding with normal markdown:

````markdown
```artifact
path: papers/out/table.csv
title: Main results table
```
````

Rules:

- `path` required — project-relative (same resolution rules as chat images: as-declared, then workspace hints, then basename+mtime).
- `title` optional — defaults to basename.
- One fence = one file. Multiple files = multiple fences (or a future multi-path variant; not Phase 1).
- Unknown keys ignored (forward-compatible).

### Compatibility with images

- Prefer **`artifact` fence** for all types, including images (unified contract).
- **Keep** supporting existing `![alt](path)` for images so old prompts / replies keep working; both render through the image specialization of the same shell (or image renderer shared by both entry points).
- Prompt guidance: for new replies, prefer `artifact` fence; `![](…)` still fine for images.

### Why not only `![](…)` for everything?

Markdown images imply visual media. CSV/JSON as fake images is wrong. A dedicated fence makes non-image types honest and extensible.

## Auto fallback (narrow)

Trigger when **all** hold:

1. Same assistant message contains a successful `experiment-run` or `experiment-log` `append_run` tool result with a non-empty `artifacts` list (declared and/or inferred at append time).
2. Prefer `artifactSnapshots` for **image** paths when presenting “what this run produced”; non-images use working `artifacts` paths.
3. Path is not already present in that message’s prose as:
   - an `artifact` fence with the same path, or
   - a markdown image targeting the same path (images).
4. Cap: at most **N = 5** auto blocks per message (stable order = artifacts array order). Overflow: one line of prose in the fallback (“+K more — open in Experiments”) — no dumping dozens of chips into chat.

Placement: append after assistant text blocks (same place as today’s `buildNaturalFigureReplyMarkdown`), as structured blocks or generated fences that go through the same renderer (prefer generating the same AST/blocks the fence parser produces — not a second visual language).

Non-triggers: bare `list`/`read`, provenance-only, results-snapshot-only (agent should embed explicitly if those matter).

## Shell UX (Phase 1)

Shared chrome:

- Muted plate, `rounded-lg`, border (align with current image frame tokens where possible).
- Left/type: short kind label or icon (`image` / `file` / later `pdf`…).
- Title + truncated project-relative path.
- Actions: **Open in Files** (reuse `openArtifactPathInFiles`); optional provenance affordance when `runId` is known (auto path may pass run context; explicit fence Phase 1 may omit runId).

Image specialization:

- Body = current clickable preview (`p-1.5` frame can merge into shell so we don’t double-frame).
- Click → existing `ChatImagePreviewDialog`.

Generic specialization:

- No inline binary preview.
- Primary action: Open in Files.
- Secondary: copy path.

PDF specialization (Phase 2):

- Body = first-page peek (pdfjs render → PNG), same muted plate as images.
- Click → dialog hosting shared `PdfDocumentView` (not the full TeX workspace `PdfPreview`).
- Header actions: Open in Files + copy path.

## Parsing & render pipeline

1. Extend markdown / block pipeline used by `MarkdownRenderer` / `static-markdown` to recognize ` ```artifact ` fences → `ChatArtifactBlock`.
2. `ChatProjectImage` becomes the **image renderer** used by the shell (or is wrapped by it); do not leave a long-term parallel “naked img only” path for agent chat.
3. Experiment tool card galleries should eventually use the same shell for consistency (Phase 1b acceptable: chat reply body first, tool cards later).

## Prompt / tool docs

- `experiments` + `reply-depth`: teach `artifact` fence for result files; images may use fence or `![](…)`.
- `experiment-run` artifacts description already “any result file” — point agents to embed important ones with the fence when summarizing for the human.
- Do **not** invent folder names in prompts.

## Phasing

| Phase | Deliverable |
|-------|-------------|
| **1** | Spec + fence parser + `ChatArtifactBlock` shell + `image` + `generic` renderers; migrate markdown images to image specialization; narrow auto-fallback (cap 5); prompts |
| **1b** | Tool-card galleries use same shell; dedupe vs reply body ✅ |
| **2** | `pdf` renderer — chat first-page peek + dialog via shared `PdfDocumentView` / pdfjs ✅ |
| **3** | `table` (csv peek); later xlsx |
| **4** | `html` sandboxed preview; document types as needed |

## Relation to existing work

- [chat-message-image-preview-design](./2026-07-17-chat-message-image-preview-design.md) — subsumed as the **image specialization** of this block; preview dialog stays.
- Experiment `artifactSnapshots` — still image-only freeze for “what this run drew”; generic artifacts remain path references.
- Artifact inference on append — feeds `artifacts[]` for History + auto-fallback; unrelated to chat syntax.

## Risks

| Risk | Mitigation |
|------|------------|
| Double render (fence + auto) | Dedupe by normalized path before fallback |
| Auto spam | Cap 5; experiment tools only |
| Agents ignore new syntax | Keep `![](…)` for images; fallback for experiment runs |
| Double chrome on images | Single shell; image body without nested second plate |

## Success criteria

1. Agent can embed a CSV via `artifact` fence; user sees a file block with Open in Files.
2. Agent embeds a PNG via fence or `![](…)`; same image preview UX as today (padded frame, enlarge).
3. Experiment run with artifacts, agent forgets embeds → up to 5 blocks appear automatically; already-embedded paths not duplicated.
4. No hardcoded `manuscript/` (or other folder) in the chat container layer.

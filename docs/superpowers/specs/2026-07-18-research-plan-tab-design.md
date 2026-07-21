# Research Plan Tab Design

**Date:** 2026-07-18  
**Status:** Implemented  
**Depends on:** `2026-07-18-plan-workflow-l2-design.md` (Plan workflow L2)  
**Related:** per-session drafts under `.prismnext/research/plans/drafts/<sessionId>.md`

## Problem

Plan markdown currently opens as a normal **Files** tab (`kind: "file"`). That causes:

1. Generic **MarkdownToolbar** on the same strip as Plan Approve / Deny
2. Plan actions bolted onto `right-area.tsx` for every file tab
3. Wrong product identity — Plan of record feels like “just another .md in Files,” not a first-class Plan surface (Cursor-style)

## Goal

Open research plan files in a **dedicated RightArea tab** with a **dedicated toolbar**, while **reusing** the Files editor/viewer stack for content.

## Non-goals

- No new Plan button on the mode toolbar (Files / TeX / Git / …)
- No third markdown editor implementation
- No change to Plan soft-restore / Approve / Deny / per-session draft semantics (except open path + toolbar hosting)

## Design

### Identity

| Piece | Choice |
|-------|--------|
| `RightTabKind` | `research-plan` |
| Mode id | `research-plan` |
| Mode toolbar | `showInModeToolbar: false` |
| Persistence | `transient` — last plan tab closed → deactivate mode (no empty home tab) |
| Content | Reuse Files content path (`FilesContent` / same viewer resolution) |
| Toolbar | Dedicated Plan toolbar: markdown preview + line-width (`MarkdownToolbarControls`) + Approve & Build / Deny when draft ready; breadcrumb via `TabToolbar` shell; **no** right-sidebar toggle |

Approved dated plans (`YYYY-MM-DD-<id>.md`) also open as `research-plan` tabs for consistent identity; **Approve & Build / Deny** only when path is a **pending draft** owned by a chat session.

### Open / focus API

Add `openResearchPlan(fileId, filePath, name, opts?)` on `right-panel-store` (mirror `openFile`, but `kind: "research-plan"` + `activateMode("research-plan")`).

Route these callers through it (not `openFile` / not Files-only expand):

- Chat: `openPlanFileInEditor` / Created Plan card
- File tree: clicking a path under `.prismnext/research/plans/` (drafts + approved)
- Any other Plan-of-record open from Plan workflow

`openProjectFileFromChat` should detect research-plan paths and delegate, or Plan open helpers should call `openResearchPlan` directly after ensuring RightArea is visible.

### Toolbar hosting

1. Remove `PlanDraftToolbar` hard-mount from `right-area.tsx` for all `kind === "file"`.
2. Register mode `Toolbar` → Plan-dedicated component (existing `PlanDraftToolbar` logic, possibly renamed).
3. `FileToolbar` stays generic — no Plan branches required once routing is correct.

### Mode chrome

- Focusing a `research-plan` tab activates `research-plan` mode (no Files highlight).
- Files mode remains for ordinary project files.
- Left/Right sidebars: omit or reuse Files tree only if needed later; **v1: no Sidebar** (`Sidebar` omitted / `hideRightSidebar` as appropriate) so the surface stays “plan document + actions,” not a second file browser.

### Lifecycle (unchanged product rules)

- Soft-restore Plan after reopen with pending draft: Plan chip + permissions; composer confirm strip stays suppressed.
- Opening the draft plan tab surfaces Approve & Build / Deny on the **dedicated** toolbar.
- Deny: discard draft, close/evict plan tab buffers, stay on chat in Build.
- Approve: promote draft → Build kick; update or close draft tab so it does not leave a stale `drafts/<sid>.md` buffer.

### Migration / edge cases

| Case | Behavior |
|------|----------|
| Existing preview `file` tab already open on a plan path | Next Plan open upgrades/replaces via `openResearchPlan` (prefer focusing `research-plan` tab; optional: close matching `file` tab for same path) |
| User opens plan path from Files tree | Always `research-plan` tab |
| Non-plan `.md` | Unchanged Files tab |
| Legacy `current-draft.md` | Still a draft path → `research-plan` tab |

## Implementation sketch (homes)

| Change | Home |
|--------|------|
| `RightTabKind` + mode def | `mode-registry.ts`, `modes/research-plan-mode/` (or thin wrapper under `modes/` reusing files content) |
| Register mode | `modes/_register.ts` |
| `openResearchPlan` | `right-panel-store.ts` |
| Route opens | `open-project-file.ts` / plan open helpers / file-tree open |
| Drop right-area bolt-on | `right-area.tsx` |
| Dedicated toolbar | move/wire `plan-draft-toolbar.tsx` as mode `Toolbar` |
| Changelog | `changelog/0.5.x.md` under next Unreleased |

## Success criteria

1. Opening a plan draft never shows Markdown formatting toolbar as the primary Plan chrome.
2. Approve & Build / Deny only appear on `research-plan` tabs (when draft ready).
3. Mode toolbar does not gain a permanent Plan button.
4. Soft-restore + Approve/Deny behavior from L2 / per-session draft work remains intact.
5. Ordinary Files tabs unaffected.

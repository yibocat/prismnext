# Commands Settings Redesign — Design Spec

**Date:** 2026-06-25  
**Status:** Phase 1–3 implemented (2026-06-25)  
**Related:** `src/main/commands/*`, `src/renderer/components/modules/settings/commands-settings.tsx`, Prompts & Rules right-panel pattern

## Goal

Evolve Custom Commands from inline textarea forms into a first-class **invocable workflow** system: composable slash commands that are clearly distinct from **Rules**, with Settings UX aligned to the rest of the app (center list + right detail panel).

## Product model: Commands vs Rules

| Dimension | **Commands (`/name`)** | **Rules** |
|-----------|------------------------|-----------|
| Trigger | User invokes in chat composer | Passive; injected every turn when enabled |
| Scope | Per-send, optional args | Persistent behavioral constraints |
| Storage | `.prismnext/agent/commands/*.md` | `.prismnext/settings.json` → `customRules` |
| Agent path | Composer → `## Command instructions` (or local action) | System prompt Layer 2.5 |
| Mental model | **Verb** — "do this now" | **Policy** — "always behave like this" |

If Custom Commands are **only** free-text templates with no args, shell capture, or local actions, they blur into Rules. The type system below keeps the boundary sharp.

## Command kinds (target architecture)

### Kind A — **Prompt command** (Phase 1 UI; engine exists today)

- User types `/name [args]` in chat.
- Template expands (`$ARGUMENTS`, `$1…$9`, `@file`) and is sent to the agent as command instructions.
- Optional `agent` / `model` frontmatter overrides (already parsed from `.md` files; expose in form later).

### Kind B — **Shell capture command** (Phase 2 UI; engine exists today)

- **User decision:** Option **A** — shell runs at **expand time** (not on Enter as a separate terminal action).
- Implementation today: `` !`cmd` `` placeholders inside `template`, executed in main process via `expander.ts` (`execSync`, project-root cwd, 5s timeout, 10KB cap).
- Phase 2 form: explicit **Shell script** field (or toggle) that writes `` !`…` `` into the stored template — users should not need to learn escape syntax.
- Output is **injected into the expanded prompt** for the agent to interpret (not shown as a standalone terminal status card).

### Kind C — **App action command** (Phase 3; partial engine exists)

- Built-ins today: `action: "compile-document"`, `"setup-agents-md"`, etc. → `actionRegistry` in renderer (`src/renderer/actions/builtin-actions.ts`).
- **Not** arbitrary user JavaScript. Only **registered, reviewed action keys** exposed in a dropdown.
- **Rationale (agreed with product):** This is the seed of an **app extension surface** — a stable, capability-based API (like internal plugins) rather than executing user code. Security = whitelist + capability declarations, not sandboxed arbitrary scripts.
- User-created action commands select `action` from catalog; handlers remain implemented in app code until a formal extension SDK ships.

### Out of scope for command kinds

- **Skills / MCP** remain separate slash catalog entries (composer chips). Commands do not subsume them in v1.
- **Future:** Skills may **invoke** commands (see § Skills integration).

## Composability (already in composer)

A single send can combine:

- One or more `/command` chips (AI expansion and/or action commands)
- Free text
- `@mentions`, code/terminal/git snippets
- `/skill` and MCP chips (independent catalog)

`compileComposerPrompt` assembles sections; custom commands should document placeholder syntax in the right-panel help, not require users to understand the pipeline.

## Scope & portability

### Default: **project-scoped**

- Commands live under `.prismnext/agent/commands/` (current `CommandRegistry`).
- Different projects legitimately need different command sets (thesis vs slides vs code-heavy repos).

### Optional: **export / import** (Phase 2)

- **Export:** zip or single `.prismnext-commands.json` / folder copy from current project commands dir.
- **Import:** merge into target project's `commands/` with name-collision prompt (skip / rename / replace).
- **Not** auto-sync across projects — explicit user action only.
- YAGNI for v1: no import UI until Phase 2; document path for manual copy.

## Settings UX

### Center panel (`commands-settings.tsx`)

- **Built-in commands** — toggle only (unchanged semantics); list row = description left, Switch right.
- **Custom commands** — list rows only:
  - Left: `/name`, description, kind badge (Prompt | Shell | Action when available)
  - Right: `Edit` (ghost `xs`, Agent-settings style), delete confirm
  - Footer: `+ Add command` → `openSettingsPanel({ kind: "custom-command", mode: "new" })`
- **No inline expand forms** (remove `expandedId`, `showAddForm`, `renderForm`).

### Right panel (`custom-command-editor-panel.tsx`)

- Same skeleton as `project-rule-editor-panel.tsx` / `workspace-folder-editor.tsx`:
  - `SETTINGS_DETAIL_SHELL`, `SettingsFormField`, `SETTINGS_DETAIL_ACTIONS` in toolbar or bottom per markdown-panel precedent (Save/Cancel in toolbar for consistency with prompt editor).
- Fields Phase 1:
  - **Name** (no `/`, validated unique per project)
  - **Description**
  - **Template** (`Textarea`, monospace) — help text for `$ARGUMENTS`, `@path`, `` !`cmd` ``
- Fields Phase 2:
  - **Kind** selector: Prompt | Shell capture
  - Shell field → generates `` !`…` `` segment prepended/appended to template
- Fields Phase 3:
  - **Kind** App action + action dropdown from registry metadata

### Slot routing

Extend `settings-panel-slots.ts`:

```ts
| { kind: "custom-command"; mode: "new" }
| { kind: "custom-command"; mode: "edit"; commandId: string; title?: string }
```

`settings-detail-panel.tsx` → `CustomCommandEditorPanel`.

## Skills integration (future, not Phase 1)

- Skills stay Agent capabilities (tooling), not slash commands.
- **Desired:** a skill definition may reference a command by name (e.g. run `/review-section` as part of a skill workflow).
- Implementation sketch:
  - Skill markdown frontmatter: `commands: [review-section, compile]`
  - Skill tool or prompt preamble tells agent to prefer those slash commands
  - Or: skill handler calls `CommandEngine.execute()` server-side and injects result
- **Phase 1:** document hook only; no skill schema change.

## Action registry as extension foundation (Phase 3 design notes)

```
┌─────────────────────────────────────────┐
│  Builtin action handlers (TS, reviewed) │
│  compile-document, setup-agents-md, …   │
└─────────────────┬───────────────────────┘
                  │ register()
┌─────────────────▼───────────────────────┐
│  ActionCatalog (metadata for Settings)  │
│  id, label, description, capabilities   │
└─────────────────┬───────────────────────┘
                  │ user picks in form
┌─────────────────▼───────────────────────┐
│  .md frontmatter: action: <key>         │
│  CommandRegistry + actionRegistry       │
└─────────────────────────────────────────┘
```

Future external extensions would register into the same catalog via a signed/manifest-based loader — **not** in Phase 1–2.

## Security notes

| Mechanism | Risk | Mitigation |
|-----------|------|------------|
| Shell capture (`!`cmd``) | Arbitrary shell in project cwd | Existing timeout/buffer; Settings warning; project-trust model (local desktop app) |
| App action | Handler bugs | Whitelist only; no user-defined action keys in v1–2 |
| Prompt template | Prompt injection to self | User owns their project; same as Rules |
| Export/import | Path traversal in zip | Validate names on import; reject `..` |

## Phased delivery

| Phase | Deliverable |
|-------|-------------|
| **1** | Right-panel CRUD; slim commands list; slot routing; parity with current fields |
| **2** | Command kind UI (Prompt vs Shell capture); export/import; kind badges |
| **3** | Action kind + ActionCatalog; user commands with `action` frontmatter in form |
| **4** | Skill → command references; optional macro composer blocks |

## Verification (Phase 1)

- Settings → Commands: Add → right panel opens; Save creates `.md` in `commands/`
- Edit/Delete refresh list; closing panel refreshes list
- `/dropdown` shows new command; expand + send still works
- Built-in toggles unchanged
- `npx tsc --noEmit`

## Known limitations

- User commands cannot set `action` until Phase 3 (form + catalog).
- Shell capture syntax hidden in Phase 1 (power users can still use `` !` `` in template).
- No global (app-wide) commands — project-only by design.

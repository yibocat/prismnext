# Changelog

> Per-minor-series changelogs live in [`changelog/`](./):
> - [`changelog/0.5.x.md`](./0.5.x.md) — 0.5.0 through 0.5.9
>
> This file retains 0.4.x and earlier.

## 0.4.5 — 2026-06-28

### PDF Preview

- Fix scroll/zoom drift: left-align pages, clamp scroll after zoom, and stabilize Lector layout via `preview.css`
- Shared PDF config (`pdf-config`, `pdf-zoom`, `pdf-scroll-clamp`) for preview and template detail
- Toolbar polish: Outline / Search / Thumbnails side panels, zoom presets and fit modes, page navigation
- Light canvas + page shadow; PDF dark mode via invert filter (Sun / Moon / Monitor toggle)
- Remove SyncTeX UI and stored highlight layer — preview is read-only navigation again

### Editor

- Fix light-mode selection flattening syntax colors: `editorSelectionTheme` hides native `::selection` color and beats community themes (e.g. GitHub Light)
- Tune selection/active-line tokens in theme generator for clearer partial-line select

### Dev

- Dev build: **Cmd+Option+I** toggles DevTools (no production menu entry)

## 0.4.4 — 2026-06-27

### Permission Gate & Tools

- Unified **permission gate** for Ask/Auto/Read-only modes — single approval path via `finalizePermissionAllow` / `finalizePermissionDeny` and new `PermissionGatePanel`
- Custom OpenCode tools **`bash`**, **`delete`**, **`move`** with file-bridge polling (`bash-permission-bridge`) when ACP permission races tool execution
- Central **`tool-permission-registry`** drives mode rules, widget metadata, and OpenCode tools config sync
- **Scheme A** for file edits: Allow authorizes disk writes; diff widgets are preview-only — no second accept via proposed-changes bar
- Bash widget, delete/move tool widgets, and AI terminal PTY execution wired through the same gate

### Project Rules

- File-based **Project Rules** under `.prismnext/agent/rules/` — list, install, delete, enable/disable via new `rules:*` IPC
- Settings → Prompts & Rules: rule markdown panel (frontmatter + preview) replaces legacy JSON `customRules` editor
- Rules injected into Prism prompt **every turn** (always-on + enabled); not passed to OpenCode config

### Skills & Profiles

- Skills sync no longer denies non-profile skills; profile allowlists filter at runtime only
- Citation Auditor profile skill id updated to **`academic-citations`**

### Settings & Log Viewer

- **General** settings hub: four overview cards; Shortcuts and Logs open in RightArea detail slots (not separate sidebar entries)
- **Log Viewer** redesign: mutually exclusive level tabs (All/Debug/Info/Warn/Error), live filter remount, cleaner empty states
- App select dropdowns default to **bottom** popper alignment (fixes category filter clipped at top)
- Git warmup / branch-switch noise moved to **debug** level

### Layout & UI Fixes

- Right pane renders **only the active tab** — fixes ghost log lines when switching editor tabs
- Chat permission ask panel and tool widgets aligned with gate flow; session UI prefs for per-tab composer state

### Architecture & Testing

- `opencode-tools-config`, `rules-sync`, permission gate spec under `docs/superpowers/specs/`
- Vitest coverage for rules sync/injection, permission gate, bash bridge, log filtering, and updated permission/tool-meta expectations (444 tests)

## 0.4.3 — 2026-06-26

### Chat & Inline Composer

- **Inline composer rewrite**: single-object-character token document model (`\uFFFC`) replaces multi-marker decorations — fixes cursor drift, block-edge typing, Backspace/arrow movement, and URL linkify offset bugs
- Unified `chat-composer-core` for panel chat and AiBar; shared query sync, compact overflow, and slash/`@` catalog plumbing
- Clickable file paths in AI replies and tool widgets (`ChatFileLink`); opens Files tab and **auto-expands RightArea**
- Chat turn layout alignment: thinking header, streaming dots, and copy footer share one `px-6` column (no double padding)
- Left sidebar session list: silent background refresh, optimistic `lastModified`, conditional title re-fetch

### Settings & RightArea Editors

- Settings redesigned as **list + detail panel** in RightArea (providers, models, profiles, prompts/rules, commands, skills, MCP, backups, compiler, TeX workspace, terminal, appearance)
- New settings-editor tab kind; stacked/split layout with `expand-settings-detail-panel` orchestration
- Commands import/export, custom command editor, MCP catalog + JSON/paste editors, skill library panel, profile/project-rule markdown panels
- Shared settings primitives: form fields, JSON/markdown editors, markdown preview, design tokens

### Git, Worktrees & Checkpoints

- Git mode overhaul: changes tree sidebar, diff chunk lines, hunk snippets, gutter highlights, filter dropdown, commit detail/file rows
- Git diff toolbar and insert-to-chat; worktree merge dialog/panel; `git-orchestrator` for push/sync flows
- Worktree selector, branch context, session-bound checkout cwd, checkpoint turn finalize/restore lifecycle
- `checkout-context` and `session-worktree-context` unify Files/Git/Chat worktree awareness

### Templates & TeX Workspace

- Template system hardening: safer path resolution, merge/apply flow, project template state, PhD thesis template content refresh
- TeX Workspace UX: compile problems panel (`parse-latex-log`), sidebar/toolbar polish, dedicated settings page
- Template center/gallery/detail improvements; workspace folder editor

### Layout, Navigation & Selection

- Left nav registry drives primary/footer entries (`left-nav-button`, immersive center views)
- RightArea inner sidebar: restored proven flex drag handle (30px collapse threshold, container squeeze) — matches outer panel feel
- Editor/terminal **Add to Chat** via selection anchors and CodeMirror insert host; right-area shortcuts
- App-native menus (`app-menu`, `app-popover`, `app-select`); content top bar and session title polish

### Agent, Commands & Skills

- Project skills refresh pipeline; OpenCode config repair on spawn; skills/commands export-import
- Command template utils and expanded slash-command registry; prompt stale detection and user display snapshots
- Skills sync and skill-creator resource updates

### Architecture & Testing

- Renderer `lib/` growth: `git/`, `settings/`, `workspace/left-nav/`, `files/open-project-file`, `chat/worktree-checkpoint-lifecycle`, `templates/project-template-state`
- Broad Vitest coverage for inline composer, git diff/tree, worktree lifecycle, settings layout, templates, and filesystem safety

## 0.4.2 — 2026-06-23

### Terminal × AI

- AI bash execution over main-process PTY (`ai-pty`, `ai-bash-runner`) with live stream to ✨ AI terminal tabs; `sessionMirrorLog` keyed by OpenCode session for durable replay
- AI terminal lifecycle (Phases A–D): session-scoped cancel/GC, live vs replay view modes, one ✨ tab per chat session, busy-tab close confirmation
- Custom OpenCode `bash` tool bridged to Prism terminal; `chat:cancel` and project teardown cancel in-flight AI PTY jobs
- Bash widget **Terminal** button: focus live stream while running, replay from log when completed
- `terminal-ai-store`, session title / left-sidebar running indicators, server status dot activity counts
- Settings → **Agent** (AI Terminal) and **Terminal** (lifecycle + Advanced PTY/Mirror transport + User Terminal placeholder)

### Interactive Terminal

- User terminal PTY stability: per-tab lifecycle, OSC 133 busy detection, worktree-aware cwd, restart/kill toolbar actions
- Terminal mode sidebar: Quick Commands accordion, **Live** / **Saved** AI sessions plus shell-named user tabs (`zsh`, `bash`, `PowerShell`, …)
- ✨ AI terminal toolbar: read-only · live/replay badge, pin (skip idle GC), copy output
- **Add to Chat** from terminal selection (anchored chip, `⌘L`); terminal snippets in inline composer
- Narrow RightArea: progressive sidebar squeeze then auto-close split layout; explicit open in narrow width still uses full overlay

### Files & Browser

- Files tab UX: open external paths, recent files, breadcrumb navigation, improved tree visibility and preview routing
- Browser mode: home page, favicon, link context menu, in-app / external open helpers (`browser-link` lib)
- Tab close confirmation for dirty files, busy terminals, and running AI commands

### Chat & Composer

- Inline token rendering split into `inline-tokens` module; terminal/file snippet parts in composer prompt compile path
- Chat scroll anchor preservation; active-turn scroll helpers; insert-to-chat from editor/terminal selections

### Architecture & Layout

- Renderer `lib/` domain layout: `workspace/`, `terminal/`, `files/`, `chat/`, `agent/`, `browser-link/`, `tex/`, `templates/`, `editor/`, `markdown/`
- Mode registry-driven right panel tabs with AI terminal metadata (`terminalSource`, `linkedChatTabId`)
- Git mode diff/accordion polish; tex workspace toolbar/sidebar alignment with shared tab patterns

### Testing

- Broad coverage for AI PTY, terminal bridge, mirror-key migration, AI terminal store/lifecycle, files-tab UX, tab-close confirmation, right-area sidebar layout, terminal buffer/OSC/input-line, and related renderer utilities

## 0.4.1 — 2026-06-22

### Agent Profiles

- Bundled agent profiles: **Academic Writer** (main), **Citation Auditor** and **Literature Scout** (subagents) under `resources/profiles/`
- Profile select in chat composer toolbar — per-tab `activeProfileId` injects a `profile-overlay` prompt layer into the system prompt
- Settings → Agent: list profiles, set project default, enable/disable builtins; profile editor dialog for custom profiles
- Profiles sync to `.prismnext/agent/profiles/` and subagent definitions to `.opencode/agents/` on project open
- New `profiles:*` IPC and `agent-profiles` / `profiles-sync` main-process services

### Inline Composer

- Token-based composer editor: `@file`, `@profile`, and `/command` chips rendered inline (replacing plain-text chips for new messages)
- Composer dropdown for file/profile/command autocomplete; structured draft serialization for session reload
- User display snapshots persisted per session so inline tokens restore correctly on history load

### Chat UI & Scrolling

- Cursor-style turn scrolling: latest user message pins to viewport top; AI output expands below with dynamic bottom runway
- Only the active turn uses a sticky user header — older turns no longer stick when scrolling history
- Session switch no longer flashes the centered “new chat” homepage: tab-level `isLoadingSession` with loading state; cached sessions hydrate synchronously
- Narrow chat panel: horizontal page scroll eliminated — long tool output and code blocks wrap or scroll inside their cards
- Tool widgets polished to Cursor-style collapsible rows: unified `ToolCard` shell, `+N`/`-M` diff badges on edit/patch, refined thinking/todo/ask-question panels
- Composer toolbar refactor: chat mode (Agent / Expert team), model & thought selectors, profile picker, permission mode with distinct icons (Ask / Auto / Read-only)

### Prompt System

- `resolve-active-modules` respects profile module overrides; profile overlay layer composes on top of domain modules

### Testing

- Tests added for profiles sync, active-module resolution, session display store, inline composer, session loading state, and user display snapshots

## 0.4.0 — 2026-06-21

### OpenCode ACP Kernel

- Replaced multi-agent CLI architecture (Claude / Gemini / Qoder per-agent parsers and sessions) with a single OpenCode runtime over ACP (JSON-RPC over stdio)
- New `AcpService` manages process lifecycle, sessions, prompts, permissions, and MCP server injection — no HTTP/SSE server or port management
- Chat IPC consolidated under `chat:*` channels; legacy `cli:*` and per-agent registry removed
- OpenCode binary bundling script and `electron-builder` packaging config added

### Prompt System

- Layered prompt composition: core persona → domain modules → AGENTS.md → user custom rules — append-only, never full replacement
- Domain modules activated for academic writing, citations, figures/tables, math equations, and workspace folders
- Prompt preview and per-module toggles in Settings → Prompts & Rules
- AGENTS.md auto-discovery and scaffold under `.prismnext/agent/`

### Skills & Slash Commands

- 16 bundled academic skills shipped in `resources/skills/` with sync to project `.prismnext/agent/skills/`
- Skills registry with remote index discovery and install/uninstall IPC
- Slash command engine: built-in commands, app commands, and user-defined commands in `.prismnext/agent/commands/` with template expansion and local action dispatch

### Chat UI

- Turn-based message layout with dedicated tool widgets (read, edit, bash, grep, glob, patch, web search/fetch, skill, task, LSP, and more)
- Permission ask panel with mode selector (auto / ask / deny) wired to ACP permission flow
- Agent settings bar: provider/model select, thought level, and permission mode as inline controls
- Restore/undo bar for checkpoint rollback; context window indicator retained

### Settings

- Settings → AI redesigned as expandable provider list with API key test, model picker, and reasoning depth
- New Commands and Prompts & Rules settings pages; old per-agent App/Project settings panels removed
- Provider registry with dynamic ACP `config/providers` fallback

### Markdown Streaming

- Removed `streamdown` and companion plugins; unified chat and file preview on `react-markdown` + Shiki
- Block-caching streaming strategy: completed blocks frozen, only tail re-parsed — eliminates caret lag during streaming

### Testing

- Unit tests added for prompt composition, skills sync/registry, permission modes, MCP transform, chat session load, and tool widgets

## 0.3.19 — 2026-06-16

### Compiler

- Tectonic backend now uses resolved binary path instead of bare command name — fixes silent spawn failure on macOS when launched from Finder/Dock
- `compileWithTectonic` now checks exit code and surfaces crash/timeout info in compile log
- Added diagnostic logging across the full compile pipeline (IPC handler, compiler service, compile store)

### Editor

- Fixed selection highlight completely invisible: `--editor-selection` CSS variable was generating invalid oklch syntax (`oklch(…)26` instead of `oklch(… / 0.28)`)
- Selection background now uses proper oklch alpha (28% light / 35% dark) with preserved syntax highlighting colors

### TeXworkspace

- Fixed re-entry showing "No open files" after closing and reopening texworkspace mode — `autoOpened` ref now resets on mode deactivation
- Auto-open file logic no longer marks itself done before confirming a `.tex` file was actually found
- Compile toolbar now shows toast errors when compilation is blocked (no file open, unresolved compile target)
- Missing `compileSynctexForward` IPC bridge added — forward SyncTeX search (Cmd+Shift+F) no longer throws TypeError

### Workspace

- Silent compile guards in `compileCurrentDocument` and `scheduleAutoCompile` now emit console warnings when blocked by missing manuscript config

## 0.3.18 — 2026-06-16

### Functional Workspace Folders

- Configurable folder structure per project: manuscript, experiment, literature, notebook, custom — with function-specific metadata and AI-readable descriptions
- Settings → Workspace replaces old Project Settings: "Current Project" editor with auto-save, "Defaults for New Projects" template, and bridge to apply current as defaults
- New project dialog extended with inline workspace folder editor — defaults pre-populated from global settings
- Manuscript folder configuration decoupled from app settings: `mainTex` entry point, directory name, and description all configurable
- TeXworkspace gracefully degrades when no manuscript is configured — shows placeholder with direct link to Workspace settings
- Workspace layout injected as first-class context component for AI agents (`workspaceLayout`), opt-in per agent integration

### Font System Defaults

- System font stack (`system-ui` / `ui-monospace`) as new default — zero-loading penalty, native platform rendering
- Default editor font synced to system mono; Code Font picker updates both editor and mono UI in one selection

### Project Creation & Validation

- Server-side validation for workspace folder config on project creation — rejects duplicate names, empty names, reserved names, and multiple manuscripts before writing to disk
- Migration: old `manuscriptDir` setting automatically converted to new `defaultWorkspaceDirs` on first load
- Settings IPC type definitions expanded to cover all persisted keys

### Cross-Project State Cleanup

- Git store fully cleared on non-git project open — prevents stale branch/file data from previous project
- Removing manuscript from workspace config clears PDF cache, compile state, and TeXworkspace tabs
- Folder deletion from file sidebar syncs workspace config entry removal

### Dead Code Cleanup

- Files sidebar mode filtering simplified to `"all" | "manuscript"` — removed unused generic `SidebarMode` string branch
- Removed unused `topFolders` memo and dead `activeMode` subscription in files sidebar
- Old `project-settings.tsx` and `right-sidebar/shared.ts` removed

### Testing

- Vitest configured with jsdom environment and `@/` path alias
- Unit tests for `workspace-config` service (read/write/validate/migration) and `workspace-config-store` (CRUD, derivation, duplicates)

## 0.3.17 — 2026-06-12

### Theme System Rewrite

- Unified theme engine replacing 7 static CSS files with dynamic OKLCH-based generation (hue + intensity two-slider system)
- Per-mode surface chroma multipliers — light mode surfaces now visibly reflect theme color instead of staying near-white
- Bundled 52 local woff2 fonts (8 families × sans/mono variants) — zero CDN dependency, instant load
- Glass vibrancy refactored: Electron native transparency with theme-aware CSS `color-mix()` per surface

### Editor Syntax Themes & Diff Unification

- 8 editor themes: Prism (auto-adapts to app color), GitHub, Nord, One Dark, Monokai, Dracula, Tokyo Night, Solarized Light
- Git diff display unified across all themes — identical appearance regardless of syntax theme or mode
- Three-layer CSS override system: external `<style>` + CM6 `Prec.highest` theme + tag-specific counter-rules
- Diff word-level tokens: clean backgrounds without underlines, borders, or overlapping decorations
- Content metrics unified: font-family, font-size, line-height locked to CSS variables via `Prec.highest` — no layout jumps on theme switch
- Editor syntax theme picker with card previews in Settings → Appearance → Editor

### Appearance Settings

- Reorganized into 4 categories: Theme (mode, color, intensity), Typography (fonts, sizes), Editor (syntax theme), Surface (radius, glass)
- New Slider component for base intensity with live preview

### Settings Persistence Fix

- Fixed `getSettings()` dropping all dynamic renderer-side keys (`editorSyntaxTheme`, `pdfDarkMode`, `manuscriptDir`, etc.) — now spreads entire raw store

### Diff Colors

- Word-level diff background opacity reduced (0.24 → 0.18) for subtler visual hierarchy while preserving clear distinction from line-level backgrounds

## 0.3.16 — 2026-06-11

### Multi-Agent Architecture

- Abstract agent layer replacing hardcoded Claude-only service with pluggable agent registry
- Agent integrations: Claude Code, OpenCode, Gemini CLI, Qoder (each with config, parser, sessions, calculator)
- `CliManager` generalized from Claude-specific to agent-agnostic: settings apply, context assembly, MCP config injection
- Session providers per agent with project-local JSONL persistence under `.prismnext/sessions/<agent>/`
- Agent-aware tokenizer with per-model encoding support
- Project context resolver: app shell system prompt + CLAUDE.md/rules + MCP config + venv/PATH augmentation
- Old `src/main/services/claude.ts` and `src/main/agents/configs.ts` removed

### Context Window Tracking

- Token calculator with categorized breakdown (system prompt, rules, skills, MCP, conversation, tools)
- `ContextWindowIndicator` component with color-coded ring visualization
- Token data persisted in JSONL result messages for cross-session replay
- Per-tab context breakdown and category schema surviving tab switches

### Agent Settings

- Per-agent settings UI: model selector, effort level, agent mode (Claude); model, temperature (Gemini)
- Settings stored in project-level `.prismnext/agent-config/` and applied as CLI args/env on spawn
- Agent App Settings panel for default prompts and gateway configuration
- Agent Project Settings panel for project-level overrides
- `AgentSettingsStore` with per-agent, per-key typed getters

### Session Resume (Critical Fix)

- Fixed session not resuming after app restart — prewarmed process without `--resume` was silently reused
- `CliSession` tracks `resumedSessionId`; `ensureProcess` detects mismatches and restarts
- Fixed spurious `cli:complete` from old process exit handler hiding streaming indicator

### Chat Initialization UX

- Progress messages as collapsible "Initialization" thinking block (no Copy button)
- Progress only on first turn of new sessions; committed to chat history on real content arrival
- `ThinkingWidget` supports `isProgress` prop: "Initialization" label, default collapsed, no timer

### Performance

- Pre-warm uses reactive `useEffect([projectRoot, worktreePath])` instead of mount-only flag
- Subsequent turns skip agent status check and prewarm IPC calls
- `saveAllFiles` deferred to fire-and-forget on non-first turns
- All synchronous JSONL writes deferred to `setImmediate` to unblock IPC response

### UI

- Agent selector dropdown in chat composer (icon + name, switchable per-tab)
- Multi-agent session list with agent name badges
- Branch selector and worktree selector updated for agent context
- New settings sidebar categories: Agent App, Agent Project

## 0.3.15 — 2026-06-10

### Template System

- Template center with gallery, detail view, file tree, PDF preview, and source viewer
- Six built-in templates (academic paper, PhD thesis, CV, beamer, poster, letter) with manifest, preview, and LaTeX source
- Template IPC: list, get, preview, getPdfData, apply with template state tracking in settings.json

### Template Switching

- Content-preserving switch with three-level category compatibility (L1 same-category merge, L2 paper↔thesis merge, L3 incompatible replace)
- SHA-256 file fingerprint change detection against stored template state
- A+B merge engine: preamble swap + section-aware body merge supporting nested braces and optional `[ToC]` arguments
- Confirmation dialogs with per-level descriptions, modified-file lists, and action buttons
- Automatic backup to `.prismnext/backups/` before every destructive switch
- Old template-only files cleaned up on switch

### Backup & Restore

- Backup Manager in Settings → Project → Backups with timestamped listing, file expansion, and restore
- Toolbar restore entry point with backup selection dialog
- Restore validates backup manifest, cleans stale files, recomputes file hashes, and updates template state
- Duplicate backup label collision prevention

### TeXworkspace Toolbar

- Redesigned layout: view mode toggles (split/TeX/PDF) at far left, standalone compile button, engine selector dropdown showing current backend name, auto-compile toggle
- Right-side group: project search, LaTeX symbol palette, environment insertion, backup restore
- Breadcrumb hidden in TeXworkspace mode; removed vertical divider lines

### TeXworkspace Sidebar

- Outline, References, Files, and Compile tabs with accordion sections and word count footer
- Project-wide search with inline results
- Header buttons right-aligned; accordion right-side duplicate chevron removed

### LaTeX Symbols

- Categorized symbol palette with KaTeX rendering (Greek, relations, arrows, operators, delimiters, accents, special)
- Click-to-insert into editor

### Bug Fixes

- `$` interpolation corruption in section merge via `String.replace` escape
- Settings.json silently destroyed on corrupted parse — now backs up and throws
- `manifest.files` null/empty deletes all tracked files — now validates before cleanup
- Race condition on rapid template switching clicks guarded with processing ref
- `currentTemplate` stale after switch and restore — now re-reads from settings.json
- Restore backup timestamp displayed as "Invalid Date" — fixed string formatting
- Unhandled rejections on failed template switch and restore — now shows toast errors
- Partial backup/restore mid-failure leaves indeterminate state — now cleans up partial artifacts
- Duplicate `\end{document}` in merged output — stripped before appending
- Empty-body LaTeX documents rejected as unparseable — now accepted

### UI Polish

- Template gallery cards: removed default shadow, Use button restyled as primary
- PDF preview area: removed "Compile to preview PDF" placeholder text
- Card component: default `shadow-sm` removed
- Toast notifications for template apply, switch, backup restore, and errors

### Project Settings

- New Project settings page: manuscript directory, default document class, auto-create main.tex

## 0.3.14 — 2026-06-10

### Mode Registry Architecture

- Centralized mode registry (`lib/mode-registry.ts`) — five modes (Browser, Files, Git, Terminal, TeXWorkspace) each defining content, sidebar, toolbar, placeholder, and empty states
- All mode components relocated from `components/modules/` and `components/layout/` into `modes/<mode-name>/` directories
- Automatic mode registration via `_register.ts` barrel import; `mode-utils.tsx` for mode-aware UI helpers

### Git Mode Rewrite

- Complete overhaul: scattered components (~1700 lines across git-overview, git-history, git-toolbar) consolidated into `modes/git-mode/` with git-viewer, git-sidebar, git-toolbar, git-push-dialog, and git-utils
- New Git sidebar with branch list, status overview, stash, and action buttons
- New Git toolbar with branch selector, fetch/pull/push, stage all / unstage all, and commit
- New push dialog with diff preview and confirmation flow
- Added `stageAll` / `unstageAll` IPC handlers for batch staging

### Git Service Reliability

- `exec()` → `spawn()` with explicit `stdio: "ignore"` — fixes EBADF errors in Electron spawn pipeline
- Warmup and all git operations now use spawn-based execution

### Terminal Mode

- Terminal sidebar restored under `modes/terminal-mode/` with session info, quick commands, and history sections

### Layout & Store Refactoring

- RightArea, right-pane, and right-sidebar restructured for mode registry integration
- layout-store and right-panel-store updated with mode-aware tab management
- Settings sidebar restructured with improved organization

## 0.3.13 — 2026-06-08

### Startup Performance

- Git warmup restructured as non-blocking fire-and-forget — loading screen now dismisses in ~1s instead of blocking 15s on macOS cold start
- Serial git execution queue prevents concurrent spawn throttling on macOS
- Shell argument escaping fixes pathspec errors for arguments containing spaces
- Enhanced warmup covering both read and write TCC paths, with per-project-root dedup
- Focus re-warm after macOS App Nap restores fast git/agent spawns

### Splash Screen

- Full-window branded splash with centered "Prism" name and indeterminate progress bar
- Light/dark theme support via CSS custom properties
- `FREEZE_SPLASH=1` env var for design iteration

### Logging System

- Cross-process structured logging with ring buffer, file persistence with rotation, and IPC bridge
- Built-in LogViewer in Settings panel with category/level/search filtering and export

### Git

- Expanded IPC surface: 20+ handlers covering status, diff, log, branches, commit, merge, stash, revert, reset
- Virtual tree rows for efficient large file tree rendering
- Git UI: overview, history, file accordion with inline diffs, toolbar

### Other

- Remark wikilinks plugin for `[[link]]` syntax
- Shared constants and log-types for cross-process type safety
- Worktree IPC channels, editor changes-bar, image-viewer, markdown-preview improvements

## 0.3.12 — 2026-06-07

### Unified Git Worktree System — AI Experiment Isolation

Standard `git worktree` integration providing isolated working directories for AI-assisted editing. Replaces the previous federated multi-unit worktree orchestration (~2600 lines) with a single, standard git-based system (~400 lines). One project = one git repo = one `git worktree add`.

- **Worktree service** (`main/services/worktree.ts`): `createWorktree`, `removeWorktree`, `listWorktrees`, `getMergeStatus`, `getBranchesWithLocks`, `moveSessionsToProject` — all via CLI git spawn with 30s timeout. Auto-initializes git repo + initial commit if needed; generates random adjective-noun worktree names (e.g., `calm-owl`); stores base branch in `.prism-worktree-meta` metadata file
- **Worktree Zustand store** (`worktree-store.ts`): lazy initialization — worktree is only created on first chat message, not when selected; `checkoutRoot` abstraction in document store seamlessly switches file tree and editor between project root and worktree path
- **Worktree IPC**: `worktree:list/create/remove/mergeStatus/branches/moveSessions` channels registered
- **Worktree UI components**:
  - `WorktreeSelector`: dropdown in chat area showing Local / Existing worktrees / New Worktree options; shows ahead/behind counts; locked (non-interactive badge) when conversation has messages
  - `WorktreeActions`: "Close Worktree" + "Push" buttons, visible when a worktree is active
  - `WorktreePushPanel`: push worktree changes to base branch via stash → checkout → merge → commit → stash pop flow
  - `MergeWorktreeDialog`: one-click finalize (checkout base → merge → delete branch → remove worktree); auto-opens Git panel on conflict
  - `BranchSelector`: branch dropdown in chat header with lock indicator when worktree is active; filters internal `wt-*` branches

### Push Flow — Data Safety (3 Critical Fixes)

- **Stash-based pre-push**: replaced dangerous `git commitAll(projectRoot, ["."], ...)` (unconditionally committed all files on whatever branch was active) with `git stash push -u` → checkout → merge → `git stash pop`. No more unwanted auto-commits on wrong branches
- **Post-merge commit**: after `git merge --no-commit --no-ff`, immediately runs `git commit` to lock the merge result to the target branch. Fixes the "staged changes drift to master" bug where uncommitted staged merge results followed the user when switching branches
- **Close Worktree safety check**: confirmation dialog when worktree has unpushed commits (`aheadCount > 0`); warns of permanent deletion via `git branch -D`; renamed from "Move to Local" to "Close Worktree"

### Staleness Detection — `behindCount`

- `WorktreeInfo` and `MergeStatus` types now include `behindCount: number` — commits in base branch not in worktree
- Calculated via `git rev-list --count <branch>..<mainBranch>` in `listWorktrees()` and `getMergeStatus()`
- Displayed as amber `{N}↓` badge in worktree list with tooltip: "N commits behind base — consider merging main into this worktree first"

### File Tree — Explicit Reload After Git Operations

- All branch-changing operations in `git-store` now call `reloadAllFromDisk()` immediately instead of relying solely on chokidar file watcher: `switchBranch`, `createBranch`, `mergeBranch`, `abortMerge`, `revertCommit`, `resetToCommit`, `discardFile`
- Chokidar watcher is now a safety net, not the primary trigger — eliminates stale file display after rapid branch switches

### Git Service Enhancements

- **Merge operations**: `mergeBranch`, `mergeNoCommit` (`--no-commit --no-ff`), `abortMerge`
- **Stash operations**: `stashPush` (with `-u` for untracked) and `stashPop`
- **CommitAll**: stage specified files + commit in one operation (`git add <files> && git commit`)
- **Revert/Reset**: `revertCommit` (`--no-edit`) and `resetToCommit` (soft/mixed/hard modes)
- **Branch management**: `deleteBranch` (`git branch -D`), `getBranchesWithLocks` (marks Prism worktree branches as locked)
- **Status parsing**: handles C-quoted paths, renames (`R old -> new`), untracked directory expansion, detached HEAD state

### Session Migration

- `moveSessionsToProject`: copies Claude session files from worktree (`~/.claude/projects/<encoded-worktree-path>/`) to project root (`~/.claude/projects/<encoded-project-root>/`) on worktree close
- Toast notifications: success shows migrated session count; failure shows warning

### UI Improvements

- **Worktree selector**: always visible when git repo exists; shows locked non-interactive badge with lock icon when conversation has messages
- **Close Worktree**: renamed from "Move to Local" with tooltip "Discard worktree and return to main project"
- **Merge conflict guidance**: auto-opens Git panel on merge failure; actionable error message with resolution steps
- **Git toolbar**: filters internal `wt-*` branches from branch list

### Design Documentation

- Unified worktree design spec: architecture, data flows, edge cases
- Branch-worktree dual model design spec
- Worktree multi-unit support design spec
- Three implementation plans

### Internal

- 35 files changed, 5685 insertions, 283 deletions
- New files: `worktree.ts` (service), `worktree-store.ts`, `worktree-selector.tsx`, `worktree-actions.tsx`, `worktree-push-panel.tsx`, `merge-worktree-dialog.tsx`, `branch-selector.tsx`, `worktree.ts` (IPC)
- Safety improvements: stash-based push, post-merge commit, close confirmation, explicit file tree reload, session migration toasts, behindCount staleness detection

## 0.3.11 — 2026-06-05

### Git System

Comprehensive Git integration with filesystem-aware status tracking.

- **Git status panel**: View staged, unstaged, and untracked changes with inline diffs via CodeMirror merge view. Stage/unstage individual files or all at once, discard changes, and commit with a message dialog
- **Branch management**: Switch between branches, create new branches, and merge branches with a two-step confirmation flow. Merge results display via toast notifications
- **Commit history**: Browse commit log grouped by date with expandable file diffs. Revert and reset (soft/mixed/hard) actions on individual commits
- **Multi-unit Git support**: Independent git repositories in subfolders are detected and managed separately via the Git sidebar
- **Files tree Git colors**: File names in the Files sidebar now reflect git status — green for staged, amber for modified/untracked, red with strikethrough for deleted. Status is fetched independently per git unit and updates in real time

### Git ↔ Files Integration

- File watcher now triggers git status refresh alongside filesystem reload, keeping both views in sync
- File create, delete, and rename operations automatically refresh git status
- Eliminated double-refresh by adding a time-guard in `scheduleAutoRefresh` and centralizing `reloadAllFromDisk` through the chokidar watcher

### Toast Notifications

- Sonner `<Toaster>` component added to the app root (bottom-right, 5 visible, close button). Previously the component was defined but never rendered, so all `toast.success()` / `toast.error()` calls were silently invisible

### UI Fixes

- **Branch label**: Fixed branch name not appearing when first opening the Git tab — replaced the `hasLoadedRef` gate with a direct `checkingRepo` check
- **Date header background**: Git history date group headers now use `bg-transparent` instead of `bg-background/95`, matching the app's glass-effect aesthetic
- **File tree expand persistence**: Folder expand/collapse state is now persisted to `layout-store` (localStorage), surviving tab switches and restarts
- **Git tree expand persistence**: Git-overview file tree expand state is held in a parent-level `Set`, surviving git status refreshes

### Internal

- `git-store.ts`: New Zustand store managing branch, status files, diffs, commits, and all git actions with IPC-backed operations
- Git service layer (`main/services/git.ts`): CLI-based git operations via `spawn()` with 30s timeout, including status, diff, stage, commit, branch management, merge, and log
- IPC handlers (`main/ipc/git.ts`): 18 `git:*` channels registered
- Preload bridge exposes full git API surface with typed parameters

## 0.3.10 — 2026-06-04

### Desktop Glass — Frosted Transparency

macOS native Vibrancy / Windows Acrylic desktop-through frosted glass effect. Enable in Settings → Appearance → Desktop glass, with 5-level intensity slider. Glass-on forces System theme to keep native vibrancy tint in sync with CSS colors.

- Electron `transparent: true` + `vibrancy: "under-window"` (macOS) / `backgroundMaterial: "acrylic"` (Windows)
- Body, Sidebar, Content, Toolbar — four independent opacity layers via CSS `color-mix()`, respecting theme hue
- Per-mode border overrides so separator/card borders stay visible on glass in both light and dark
- New Switch and Slider UI components

### Theme System Overhaul

- **Warm → Teal**: Replaced Warm theme with Teal (cyan-green, hue 185–195), filling the gap between blue and green. Default theme is now Academic Blue
- **Theme Color Picker**: Visual palette picker in Settings → Appearance with 5-step gradient bars per theme
- **`--accent` chroma boost**: 2–3× chroma increase across all 7 themes so `--accent` is visibly distinct from `--muted`; all hover effects now show real theme color
- **Solid border colors**: Dark-mode `--border` changed from transparent-white to solid dark gray; light-mode adjusted for visibility on glass. All 7 themes updated
- **Terminal theme-aware**: Terminal background reads `--background` via oklch→hex conversion, adapts to theme color and light/dark mode in real time

### Layout & Interaction

- **Global hover unification**: All toolbar, sidebar, editor, browser, and terminal buttons use `hover:bg-accent hover:text-accent-foreground`
- **RightArea maximize fix**: Closing RightArea while maximized no longer saves the maximized width; reopen restores last normal width
- **Window size persistence**: Window bounds saved on close, restored on next launch
- **TeX Workspace shortcut**: LeftSidebar "TeX Workspace" button now creates the texworkspace tab, opens RightArea maximized
- **New Agent + button**: ContentTopBar gains a `+` button (visible when sidebar collapsed), duplicates the "New Agent" action
- **ProjectSwitcher**: Dropdown matches trigger width; items use theme-colored hover
- **Session title separator removed**: The vertical bar between sidebar controls and session title in ContentTopBar is gone

### Chat & Messages

- Fixed Mermaid diagram action buttons overlaying sent-message header (z-index)
- Sent-message header: reduced border radius, added border separator, matched input border color

### Settings

- **Shortcuts reference page**: Lists all 19 keyboard shortcuts with Active / Placed / Planned status labels
- Theme selector locked to System when Desktop glass is active

### Fixes

- Settings Sidebar glass effect now matches main LeftSidebar
- Border line visibility in light mode on glass backgrounds
- Multiple light/dark mode border color inconsistencies resolved

## 0.3.9 — 2026-06-03

### Terminal Mode — Real Shell in Right Panel

- **Integrated terminal**: xterm.js (renderer) + node-pty (main process) provides genuine system shell sessions via PTY; spawns user's default shell ($SHELL, typically zsh on macOS, cmd/PowerShell on Windows) at project root directory
- **Multi-tab terminal**: each tab is an independent PTY session; tabs can be created via toolbar `+` button or the Terminal toolbar icon; session lifetime is bound to tab (close = kill PTY)
- **TerminalToolbar**: shows session name (directory basename), Clear Screen button, Interrupt button (sends Ctrl+C via IPC), and New Terminal `+` button
- **TerminalSidebar** (3 accordion sections):
  - *Quick Commands*: user-configurable command shortcuts (add/edit/delete) persisted to `.prismnext/terminal/config.json`; click to execute in active terminal; context menu with Run/Edit; inline delete button
  - *Environment*: per-session info (shell path, CWD, PID) from active PTY + global system info (node version, platform, home directory)
  - *History*: command history tracked per-session (deduplicated, max 100); click to re-run; clear-all button
- **IPC architecture**: `terminal:create/destroy/write/resize/data/exit` channels; write/resize use `ipcRenderer.invoke` (reliable async round-trip); data/exit are push events (main → renderer via `webContents.send`); session lookup with generation-based IDs prevents React Strict Mode double-mount race conditions
- **Focus management**: aggressive multi-stage auto-focus (rAF + 60ms + 200ms delays) ensures keyboard input reaches xterm's hidden textarea; click-to-focus via mousedown handler
- **Theme integration**: xterm.js terminal colors match app light/dark mode (VS Code Dark+ / Light+ inspired ANSI 16-color palettes) via `useTerminalTheme` hook; outer padding area background color matched to terminal theme
- **Exit/restart behavior**: when shell exits, terminal displays exit code and "Press Enter to restart" prompt; Enter respawns a new PTY session on the same tab; close confirmation only appears when a process is actively running (input/output timing heuristic with 400ms debounce)
- **Close confirmation**: closing a terminal tab with a running process prompts "A process is still running. Close anyway?"; idle terminals close without confirmation
- **Tab bar integration**: terminal tabs display Terminal icon (from lucide-react) and directory name as title; tab drag-to-reorder, context-menu close/close-others fully supported
- **Native module**: node-pty compiled against Electron 35 via @electron/rebuild; externalized in electron-vite config; postinstall script auto-rebuilds on pnpm install
- **Cross-platform**: shell detection via `$SHELL` (Unix) / `%COMSPEC%` (Windows); xterm.js font stack degrades gracefully across platforms

### Dependencies Added
- `@xterm/xterm` 6.0, `@xterm/addon-fit` 0.11, `node-pty` 1.1, `@electron/rebuild` 4.0 (dev)

## 0.3.8 — 2026-06-03

### Browser Mode — Complete Features & Polish

- **Multi-tab browser**: each browser tab manages its own `<webview>` with independent URL, title, and loading state; `new-window` events from target="_blank" links and window.open() are intercepted via script injection and redirected to new browser tabs instead of native windows
- **Navigation toolbar**: Back/Forward/Reload buttons with spinning animation during load; URL bar with auto-https and Enter-to-navigate; Stop button replaced by spinning refresh icon; Star button for bookmarking with filled amber star when current page is bookmarked (URL-normalized comparison ignores trailing slash, www prefix, and fragments)
- **Three-dot menu**: Clear History (local recent visits), Clear Cookies (session.defaultSession.clearStorageData), Clear Cache (session.clearCache + localStorage/ServiceWorker/IndexedDB/CacheStorage cleanup)
- **Bookmark system**: user-managed bookmarks persisted to `.prismnext/browser/bookmarks.json` via IPC; seed 6 academic bookmarks (Google Scholar, arXiv, DOI, PubMed, dblp, Semantic Scholar) on first init; add/remove with deduplication (normalized URL comparison)
- **Recent visits**: auto-recorded on page load (page-title-updated event); capped at maxRecentItems (default 50); deduplication; clear-all and per-item remove; persisted to `.prismnext/browser/recent.json`
- **BrowserSidebar**: two accordion sections (Bookmarks, Recent) matching texworkspace sidebar pattern; favicon display from domain root (`/favicon.ico` with original URL protocol, no third-party dependency); inline Rename (click-to-edit title) and Change URL (expandable input row) via context menu; refresh button with spin animation syncs from disk and retries favicon loads; right-click context menu with Open / Open in New Tab
- **Webview link context menu**: right-click on links in any web page shows Open / Open in New Tab via script-injected contextmenu interception
- **Tab hibernation (LRU eviction)**: max 5 active webviews; when exceeded, least-recently-used tabs are hibernated (webview unloaded → memory freed); switching to a hibernated tab wakes it and reloads; registry-based LRU tracking in webview-registry.ts
- **Sidebar drag performance fix**: fullscreen transparent overlay during right sidebar resize blocks webview's native surface from intercepting mousemove events, eliminating jank
- **Page load error display**: did-fail-load handler shows error description with retry button; error auto-clears on new URL navigation
- **loading-bar animation**: CSS keyframes in globals.css
- **URL normalization**: consistent across bookmarks, recent visits, and toolbar comparison (strips trailing slash, www prefix, fragment)

### Layout & Shared Improvements

- **TabBar fix**: changed tab selection from onMouseDown to onClick — closing tabs no longer causes a flash of the closing tab being activated first
- **TabToolbar spacer**: new hideSpacer prop for browser tabs; spacer (flex-1) only renders when breadcrumb is present, preventing BrowserToolbar from being pushed right
- **Sidebar auto-open**: entering any RightArea mode (Files/Git/Browser/Texworkspace) now auto-opens the right sidebar (was texworkspace-only)
- **Empty states simplified**: removed icons from all empty states (NoFileOpen, GitPlaceholder, RightPane default, BrowserView empty/hibernated); single centered line of muted text; fixed vertical centering by adding flex flex-col to PaneContent wrap div

### Texworkspace

- **Auto-compile on entry**: opening texworkspace with autoCompile enabled now immediately compiles the main .tex file (100ms delay for editor mount)
- **Settings TODO**: documented in compile-store that autoCompile should be exposed in future Settings panel

### File Toolbar — HTML Preview

- **HtmlPreviewButton**: new GlobeIcon button in FileToolbar for .html/.htm files; creates a new browser tab and loads the file via file:// protocol

### Changes

```
21 files changed, 892 insertions(+), 135 deletions(-)
```

## 0.3.6 — 2026-06-02

### Texworkspace Mode — Structure Sidebar & Centralized Hook

- **TexworkspaceSidebar** (`texworkspace-sidebar.tsx`, 507 lines): new dedicated sidebar replacing the generic FilesSidebar in texworkspace mode, with two sub-tabs (Structure / Compile Log) and four accordion sections: Table of Contents (hierarchical tree with heading icons, expand/collapse per node), Labels (grouped by kind — section/figure/table/equation), Cited References (with author/title/year display), and TeX Files (folder tree navigation); click any entry jumps to source line via `requestJumpToLine`
- **`useLatexStructure` hook** (`use-latex-structure.ts`, 214 lines): parses all `.tex` files in the project extracting `\section`/`\subsection`/etc. hierarchy, `\label{}` entries with kind inference, `\cite{}` references with resolved author/title/year from `.bib` files, and filtered `.tex` file list; memoized with `useMemo` for performance
- **`useTexworkspace` centralized hook** (`use-texworkspace.ts`, 84 lines): consolidates all texworkspace-specific logic previously scattered across right-area, right-main-area, right-sidebar, files-sidebar, editor, and content router — exposes `isActive`, `viewMode`, `setActiveFile`, `switchToFile`, `compileFile`, and auto-opens the main `.tex` file on initial texworkspace entry
- **RightMainArea refactored**: nested ternaries replaced with `wrapper()` helper + early-return pattern; split view panel order swapped (PDF left, editor right); now uses `useTexworkspace` hook instead of direct Zustand selectors
- **`setTexworkspaceActiveFile` store action**: switches the active file within the texworkspace tab without changing the tab title (unlike `openTexworkspaceFile`)
- **Texworkspace singleton**: `ensureTab("texworkspace")` now reuses existing texworkspace tab instead of creating duplicates
- **`requestJumpToLine` in document store**: event-based mechanism for sidebar navigation to trigger editor jump-to-line
- **TexworkspaceToolbar**: auto-compile Zap icon color changed (yellow when on vs muted when off); view mode toggles use consistent button styling
- **Word count footer**: SidebarFooter in texworkspace sidebar displays approximate word count (strips LaTeX commands, comments, and brackets before counting)

### Layout System — Dashboard & Tab Sync

- **Dashboard sidebar** (`dashboard-sidebar.tsx`, 33 lines): new empty-state sidebar shown when no tabs are open, replacing the stale "files" default
- **`RightToolbarTab` expanded**: added `"dashboard"` variant; default changed from `"files"` to `"dashboard"`
- **Tab-to-toolbar sync improved**: merged two separate `useEffect` hooks into one (toolbar tab + sidebar auto-open), using `useRef` for previous texworkspace state to avoid stale closure issues; added `"dashboard"` fallback when no tab is active

### Compiler — Tectonic V2 Flag

- **Tectonic `-Zallow-deprecated=true` flag**: added to compiler service to suppress deprecation errors with newer Tectonic versions
- **Compile IPC**: passes the flag through the compile handler chain

### Right Panel Store — Texworkspace Tab Management

- `ensureTab` now returns `string` (tab ID) for all code paths
- Texworkspace tabs are singletons — second `ensureTab` call switches to existing tab
- `setTexworkspaceActiveFile` switches file without title change for sidebar navigation

### Type Fix

- `SynctexForwardResult` → `SynctexForwardResult | null` in `electron.d.ts` compile forward handler return type

### Dependencies

- Added: `@iconify/react` for file-type icons in texworkspace sidebar file tree

## 0.3.5 — 2026-06-02

### Right Panel — Tab State Persistence (Keep-Alive)

- **RightPane CSS keep-alive**: all open tabs' viewer components stay mounted in the DOM; inactive tabs are hidden via `position: absolute + visibility: hidden` instead of being unmounted — switching tabs now preserves cursor position, scroll position, undo history, PDF page number, side panel state, and all other internal viewer state without loss
- **TabContext system** (`lib/tab-context.ts`): new React Context injected by `PaneContent` that provides each viewer with its OWN tab's `fileId`, `filePath`, `kind`, and `isActive` — replacing the previous pattern where every viewer read the global `activeTab` from the Zustand store, which caused all mounted (hidden) editors to fight over the same file
- **PaneContent refactored**: `resolveViewer` now returns JSX elements directly instead of `React.ComponentType` to avoid `React.createElement` import issues; every viewer is wrapped in `<TabContext.Provider>` for data isolation
- **Editor focus management**: `LatexEditor` and `CodeEditor` now watch `isActive` from TabContext — active tab's editor auto-focuses, inactive tab's editor auto-blurs, preventing hidden editors from capturing keyboard events
- **RightMainArea reverted to conditional rendering**: the compiled-PDF panel in texworkspace mode does NOT use CSS keep-alive because Lector's virtualizer breaks when the panel container is resized to 0px; instead, page position is persisted and restored on remount
- **Fix RightPane overflow**: tab wrapper was missing `flex flex-col`, causing inner `flex-1 min-h-0` content to overflow its container and make the entire RightArea scrollable

### Cross-Session Position Persistence

- **New `lib/viewer-position.ts`**: lightweight localStorage persistence for scroll/page/cursor positions keyed by absolute file path — survives app restart
- **PDF page persistence**: `PdfPreview` saves current page every 3s via ref-based interval (avoids interval recreation on page change) and immediately on unmount; restores page on PDF load via `jumpToPage` from saved position
- **Editor position persistence**: `LatexEditor` and `CodeEditor` save cursor position and scroll position every 3s and on editor destruction; restored on mount with `scrollIntoView` after a `requestAnimationFrame` for correct layout
- **Position save skipped during merge view**: `isMergeActiveRef` check prevents saving spurious cursor/scroll values while the merge diff is active

### Text Selection Policy

- **Global `select-none`** on App root div — all UI chrome (sidebars, toolbars, tabs, buttons) no longer allows text selection, giving the app a more native desktop feel
- **`select-text` on PDF pages** (`Pages` component) — PDF text selection remains fully functional
- **`select-text` on chat area** (`LeftMainArea`) — AI responses and thinking blocks remain selectable for copy

### Viewer Data Isolation

- `MarkdownPreview` and `ImageViewer` migrated from reading global `activeTab.fileId` to using `useTabContext()` — each viewer now renders the correct file regardless of which tab is globally active

## 0.3.4 — 2026-05-31

### AiBar — Floating Chat Bar Rewrite

- **Relocated**: `AiBar` moved from `modules/shared/` to `modules/chat/` — it's now a core chat component rendered in RightArea when editor is maximized
- **Three-phase state machine** (`idle` → `input` → `expanded`): idle shows a thin 1.5px pill that expands on hover ("Manage AI Assistants ⌘I"); clicking opens a capsule input bar (single-line with + menu, text input, and send button); multi-line content auto-expands to full `ChatComposer` with seamless text handoff via native DOM setter
- **Chat panel overlay**: clicking "Done" / "Running" opens a conversation panel (`min(60vh, 600px)`) above the input area showing `ChatMessages` — panel opens with `animate-in fade-in slide-in-from-bottom-2` and closes with `animate-out fade-out slide-out-to-bottom-2` (150ms)
- **Click-outside to close**: panel auto-closes when clicking anywhere outside the panel, capsule, expanded composer, or Radix dropdowns
- **Context-aware toolbar**: Done/Running button only appears when there's a conversation (`messages.length > 0 || isStreaming`); Running state shows a pulsing dot indicator; Worktree selector always visible (Git functionality, not conversation-scoped)
- **Width alignment**: container hierarchy restructured to `max-w-3xl` outer → `px-3` inner, ensuring the capsule border, chat panel, and expanded ChatComposer all share identical visual width (`min(container, 48rem) - 24px`)

### Markdown Rendering — react-markdown → streamdown

- **Replaced `react-markdown`** with `streamdown` v2.5.0 — unified streaming-aware markdown renderer with built-in plugin system
- **New plugins**: `@streamdown/cjk` (CJK-friendly text handling), `@streamdown/code` (syntax-highlighted code blocks via Shiki), `@streamdown/math` (LaTeX math rendering with KaTeX), `@streamdown/mermaid` (Mermaid diagram support)
- **Removed dependencies**: `react-markdown`, `rehype-raw`, `rehype-sanitize`, `remark-gfm` — all functionality now handled by streamdown ecosystem

### Performance — Resize Smoothness

- **CSS transitions narrowed**: capsule, toolbar, and idle label in AiBar changed from `transition-all` (which animated `width` during window resize, causing ghosting) to targeted property transitions — `transition-[height,max-width,padding,background-color,border-color]` for capsule, `transition-[height,opacity,transform,margin]` for toolbar
- **CSS containment**: `[contain:layout_style]` added to LeftMainArea, RightArea, and both center panel wrappers in App.tsx — tells the browser these subtrees' layouts are independent, preventing cascading layout recalculations during window resize
- **`React.memo` on RightArea**: RightArea receives only 3 refs as props (never change); wrapping with `memo` prevents cascading re-renders from App.tsx Zustand subscriptions during resize
- **`React.memo` on ChatMessages**: prevents unnecessary re-renders from parent (AiBar phase transitions, panel open/close)

### Session Loading — Async I/O

- **`loadSessionHistory`**: `readFileSync` → `await readFile` from `fs/promises` — no longer blocks the Electron main process during session load
- **`listClaudeSessions`**: `readdirSync` + `statSync` + per-file `readFileSync` → `await readdir` + `await stat` + `await readFile` — eliminated the per-session synchronous file reads that blocked the UI when listing sessions with large histories
- **Immediate tab switch**: `loadSession` now sets `activeTabId` in the first `set()` call (before the IPC round-trip), giving users instant visual feedback when clicking a session — the new tab appears immediately, messages populate asynchronously

### ChatComposer — Background & Focus

- **Background fix**: `bg-muted/30` (30% transparent) → `bg-card` (solid) — fixes transparent background showing through in AiBar's floating expanded view
- **Focus state cleaned**: removed `focus-within:bg-background` — the card-to-background color shift on focus looked awkward; border ring color change alone sufficiently indicates focus

### ChatMessages — Empty State

- Simplified from large icon + "Start a conversation" heading + descriptive paragraph to a single muted line: "No messages yet — start a conversation below"
- Removed unused `MessageSquareIcon` import

### LeftSidebar — Padding Cleanup

- Removed `pt-1.5` (6px) from the fixed function buttons container — buttons now sit flush below the titlebar
- Removed `pt-1.5` (6px) from the ProjectSwitcher wrapper — eliminates doubled top padding
- Spacing between Done/Running button and Worktree selector moved from Worktree's `ml-1` to Done button's `mr-1` — spacing naturally disappears when Done button is hidden (New Agent state)

### Spacing Consistency

- Toolbar-to-input gap unified with panel-to-input gap: both now use `mb-2` (8px), previously toolbar used `mb-1` (4px)

### Dependencies

- Added: `streamdown@^2.5.0`, `@streamdown/cjk@^1.0.3`, `@streamdown/code@^1.1.1`, `@streamdown/math@^1.0.2`, `@streamdown/mermaid@^1.0.2`
- Removed: `react-markdown@^10.1.0`, `rehype-raw@^7.0.0`, `rehype-sanitize@^6.0.0`, `remark-gfm@^4.0.1`

### New Utilities

- **`debounced-storage.ts`**: debounced storage writes for frequently-updated state

## 0.3.3 — 2026-05-30

### Performance — Streaming Render Architecture Overhaul

- **Eliminated double-render**: removed `tick()` forced re-render in `use-cli-events.ts` — Zustand selectors already trigger reactivity; extra `useState` tick caused every stream delta to render the entire component tree twice
- **Split streaming message from committed messages**: `TabState` now has `streamingMessage` (mutable, per-delta) separate from `messages` (immutable, append-only); during streaming, `_upsertLastMessage` operates on `streamingMessage` in O(1) instead of copying the full messages array (O(n)); committed message references stay stable, preventing memo'd historical components from re-rendering
- **Incremental useMemo computations**: `toolResultMap`, `metaMap`, `inlinedResults`, and committed display filtering now depend only on `messages` (committed), not on the streaming-dependent `allMessages`; O(n) scans only run on message commit, not on every character delta
- **Granular projected field updates**: `_setStreaming`, `_setSessionId`, `_setError` only update their specific projected field instead of calling `projectActiveTab` to rebuild all fields — eliminates spurious selector re-renders on unrelated state changes

### Tool Widgets — Decoupled Architecture

- **Extracted `tools/` directory**: `tool-widgets.tsx` (528 lines, 9 components) split into 8 focused files — `edit-widget.tsx`, `bash-widget.tsx`, `todo-widget.tsx`, `thinking-widget.tsx`, `ask-question-widget.tsx`, `generic-widget.tsx`, `shared.tsx` (StatusIcon + DiffLines), `index.tsx` (ToolWidget router); each file 30–140 lines, single responsibility
- **All widgets memo'd**: each extracted widget wrapped in `React.memo` for render stability

### Thinking Widget — Correct Timer Isolation

- **Message-level streaming detection**: `ThinkingWidget` now accepts `isStreamingMsg` prop (passed from `ChatMessages` → `AssistantMessage`) instead of subscribing to global `useChatStore(s => s.isStreaming)`; fixes bug where all completed thinking blocks restarted their timers when a new interaction began
- **Thinking timer stops when thinking completes**: `AssistantMessage` detects `thinkingComplete` (text/tool_use blocks present) and sets `isStreamingMsg` to false; thinking elapsed time freezes at actual thinking duration, not total response time
- **Elapsed display with 1 decimal place**: timer updates every 100ms; `displayDuration` uses frozen `elapsed` (not text-length estimate) when timer stops; formatted as `"Thought for 12.3s"`

### Streaming Indicator — Simplified

- **Removed timer**: `StreamingIndicator` no longer shows elapsed seconds — just three bouncing dots + "Thinking..." text; represents CLI startup / waiting-for-first-token, not AI thinking time
- **10-character thinking threshold**: `showStreamingIndicator` requires ≥10 chars of thinking content before hiding, preventing 1–2 char delta flicker during the transition to `ThinkingWidget`

## 0.3.2 — 2026-05-30

### Streaming — Per-Token Real-Time Output

- **Added `--include-partial-messages` to Claude CLI args** — enables Anthropic API delta events wrapped in `stream_event` NDJSON envelopes, enabling true token-by-token streaming
- **Rewrote `ClaudeParser`** — unwraps `stream_event` envelopes, accumulates `content_block_delta` events, and emits progressive `assistant` messages after each delta; also handles direct `assistant`/`user`/`result` messages and top-level delta events defensively
- **Persistent process architecture** — switched from one-shot `-p` mode (each prompt spawned a new process, paying ~2s startup cost every time) to stdin/stdout long-lived process using `--input-format stream-json`; subsequent messages now skip the entire startup overhead
- **Prewarm support** — `cli-manager.ts` eagerly starts the Claude process on app launch via `ensureProcess()`; `cli:prewarm` IPC handler wires it through; first message latency significantly reduced
- Added `--dangerously-skip-permissions` to skip permission checks and `CLAUDE_CODE_EFFORT_LEVEL=low` env var for faster responses
- Parser emits empty-block guard: blocks with no text/thinking/input are suppressed, preventing the StreamingIndicator from being hidden before real content arrives

### Chat UX — Meta Display, Streaming Indicator, Composer

- **Completion time + token display**: completion time now formatted in seconds (`4.6s` instead of `4604ms`), displayed left of copy button; token usage (`↑23.6k ↓64`) pushed to the right via `ml-auto` with `·` separator; all computed from `displayMessages` at render time via `metaMap` — survives tab switches, view switches, and session reloads
- **`loadSession` no longer discards result messages** — `msg.type === "result"` was filtered out, dropping `duration_ms` and `usage` needed for meta display; now only `system` messages are filtered
- **`loadSession` always creates a new tab** — previously overwrote the current tab's messages (and sessionId), destroying in-memory meta for the original session; now each loaded session gets its own tab
- **StreamingIndicator timing fix**: indicator now stays visible until `hasThinkingContent` is true (thinking text > 0 characters), eliminating the "flash → blank ~1s → content" gap caused by empty initial deltas; reset moved from `useEffect` to render-phase via `prevStreamingRef` pattern to avoid React 18 batching race
- **Textarea height restored**: `rows={1}` → `rows={2}`, `min-h-10` → `min-h-12` (40→48px); toolbar spacing tightened (`gap-1.5`→`gap-1`, `pb-2`→`pb-1.5`)
- **Homepage toolbar spacing**: removed `pb-1` from toolbar, reduced composer top padding from `p-3` to `pt-2`
- **Removed `-my-2` and `[&_textarea]:min-h-14`** from composer wrapper (left-main-area.tsx) — negative margins caused page-level scroll overflow
- **Removed `shrink-0`** from ChatComposer root div — allows natural flex shrinking

### Sidebar — Performance Fix

- **Stopped subscribing to entire `tabs` array** in `LeftSidebar` — every stream delta triggered a store update, recreating the tabs array and re-rendering the entire sidebar hundreds of times per second; now only uses `sessionId + isStreaming` for the active-session streaming spinner
- **Wrapped `LeftSidebar` in `React.memo`** — prevents re-renders from parent component updates
- **Fixed `cli:sessionCreated` flooding**: removed the `!this.tabSessionIds.has(tabId)` guard during persistent-process rewrite, causing the event (and subsequent `fetchSessions()` call) to fire on every stream message; guard restored

### Architecture — CLI Coordination Layer

- **Deleted old ACP layer**: `agent-manager.ts` (394 lines), `agent.ts` (IPC, 200 lines), `use-agent-events.ts` (425 lines)
- **Added CLI coordination layer**: `cli-manager.ts` (persistent process lifecycle, stdin/stdout management, 235 lines), `cli.ts` (IPC handlers, 165 lines), `use-cli-events.ts` (stream → store bridge, 267 lines), `claude-parser.ts` (NDJSON parser with delta accumulation, 210 lines)
- **IPC channels renamed**: `agent:*` → `cli:*` across preload, IPC handlers, and type declarations; added `cli:answer` handler (was missing, caused silent failures for AskUserQuestion widget)
- **`ChatStreamMessage` type** remains the universal message format — any agent parser emits this shape; store, components, and IPC are agent-agnostic
- **`configs.ts`**: removed ACP references from OpenCode (`opencode acp --stdio`), Gemini (`--acp --stdio`), and Qoder (`acp --stdio`) — replaced with minimal placeholder args; added comprehensive integration guide (6 files to touch, CliParser interface requirements, CLI compatibility criteria)
- **`agent-config.ts`**: added cross-reference to main configs.ts integration guide
- **`chat-store.ts`**: added `messageMeta` per-tab map for completion/token metadata; `_upsertLastMessage` merges progressive assistant updates; `_appendMessage` atomically attaches meta when appending result messages; `messageMeta` survives message object replacement
- **`chat-messages.tsx`**: extracted `metaMap` computed from `displayMessages` consecutive `assistant → result` pairs; `inlinedResults` set for deduplication; `hasThinkingContent` for StreamingIndicator timing
- Store initialized with `messageMeta: {}` on `makeDefaultTab` and projected via `projectActiveTab`

### Fixes

- `cli-manager.ts` missing `tabSessionIds` field initialization → crash on first stream message (`Cannot read properties of undefined (reading 'has')`)
- `cli:answer` IPC handler was entirely missing — AskUserQuestion widget answers were silently dropped
- `LeftSidebar` `React.memo` wrapper requires `import { memo }` and closing `});`

## 0.3.1 — 2026-05-29

### Architecture: Remove assistant-ui, Inline Chat System

- **`@assistant-ui/react` dependency removed** — eliminates the entire assistant-ui runtime layer (v0.14.5), reducing bundle size and removing a third-party abstraction between the app and ACP streaming
- **Chat drawer system deleted**: `ClaudeChatDrawer`, `ClaudeRuntimeProvider`, `AssistantMessage`, `UserMessage`, `SessionSelector`, `ChatTabBar` — all assistant-ui-coupled components removed (~800 lines)
- Chat is now fully inline in LeftMainArea: homepage view (composer centered) and conversation view (messages + composer at bottom) — no more overlay/drawer/expanded state machine
- **`drawerState` removed** from `claude-chat-store` (the `closed | open | expanded` tri-state) — chat visibility is now implicit based on active tab and message history
- **`convertMessages` + `convertBlock` deleted** — the ~200-line message conversion pipeline (ClaudeStreamMessage → ThreadMessageLike via assistant-ui types) is no longer needed
- `AgentSettingsBar` replaces assistant-ui Primitive-based message parts rendering for agent config display

### Agent Settings System — Per-Agent Configuration Schema

- **New `AgentSetting` type system** in `configs.ts` (main process): `AgentSettingOption`, `AgentSettingType` (`"model" | "select" | "effort"`), and `AgentSetting` interfaces
- **Each agent now declares its own settings schema** via `AgentConfig.settings[]`:
  - Claude Code: Model (sonnet/opus/haiku), Mode (edit-before-ask/auto-edit/plan), Effort (low/medium/high)
  - OpenCode: Model (gpt-4o/gpt-4-turbo), Reasoning (low/medium/high)
  - Gemini CLI: Model (gemini-2.5-pro/gemini-2.5-flash), Style (precise/balanced/creative)
  - Qoder CLI: Model (llama-4/mixtral)
- **Settings flow through ACP pipeline**: `agentMode` and `effortLevel` are now passed from renderer → IPC (`agent:send`) → agent manager (`sendPrompt`) → stored in tab session settings for future ACP session configuration
- **New `agent-config.ts`** (renderer lib, 135 lines): mirrors main-process agent configs for renderer use (`AGENT_UI_CONFIGS`), decoupling UI from main-process imports

### AgentSettingsBar — Unified Settings Dropdown

- **New `AgentSettingsBar` component**: replaces the old Portal-based inline model picker in `ChatComposer`
- Single dropdown showing all active settings: e.g., "Sonnet · Edit before ask · L"
- **Three setting types supported**: `model` (dropdown with name + description), `select` (simple dropdown), `effort` (L/M/H segmented button)
- Model picker, agent mode selector, and effort level controls extracted from `ChatComposer` and consolidated into this reusable component
- Rendered inside `ChatComposer` bottom bar alongside the new "+" context menu

### AiBar — Floating AI Input Bar

- **New `AiBar` component** (158 lines): macOS Spotlight-style floating pill at the bottom of the editor area
- **Three-phase state machine**: `idle` (thin 1.5px-high pill, expands on hover), `input` (single-line input field with send button), `expanded` (full `ChatComposer` for multi-line input)
- **Seamless text handoff**: text typed in the input phase is injected into the expanded ChatComposer's textarea via native DOM setter + input event dispatch, preserving cursor position
- **Auto-expand on overflow**: single-line input automatically expands to full composer when text overflows the input width
- **Keyboard shortcut hint**: idle pill shows "Manage AI Assistants ⌘I" on hover
- Appears in RightMainArea when editor is maximized — replaces the old `AiFab` floating button placement
- `AiFab` retained in codebase but removed from `RightMainArea` render paths

### Preview → Texworkspace Rename

- **Systematic rename across 20+ files**: `preview` → `texworkspace` for tab kind, store state, components, and directory
- `preview-mode/` directory → `texworkspace-mode/`; `PreviewToolbar` → `TexworkspaceToolbar`; `previewViewMode` → `texworkspaceViewMode`
- `RightTabKind`: `"preview"` → `"texworkspace"`; `RightToolbarTab`: `"preview"` → `"texworkspace"`; `PreviewViewMode` → `TexworkspaceViewMode`
- Store methods renamed: `openPreviewFile` → `openTexworkspaceFile`, `switchToPreview` → `switchToTexworkspace`
- All layout, sidebar, right-panel, editor, and toolbar references updated consistently

### Right Sidebar — Architecture Rewrite

- **Removed `react-resizable-panels` Group/Panel/Separator** from right sidebar inner layout — replaced with custom flex layout (`flex-1` main + `shrink-0` sidebar) plus custom `SidebarDragHandle`
- **New `SidebarDragHandle` component**: custom mouse-drag handler (mousedown/mousemove/mouseup on document), reverse-direction drag (dragging right shrinks sidebar), wider hit area (`-left-1 -right-1`) for easier grabbing
- **`ResizeObserver` on sidebar DOM element**: syncs actual rendered width back to store, handles squeeze-by-container scenarios where the user isn't actively dragging
- **Collapse threshold 30px**: width saved only above 30px (preserves last real width); sidebar auto-closes when width drops below 30px — same pattern as App.tsx Panel onResize
- **`sidebarFullMode`**: when toggled open in narrow space (container width < sidebarWidth + 150), sidebar fills the entire RightArea (overlay-style), decided at toggle time
- **`toggleRightSidebar` → `setRightSidebarOpen` + custom `handleToggleSidebar`**: narrow check at open-time determines full mode; closing always clears full mode
- **Width constraints updated**: `SIDEBAR_RIGHT_MIN` 100 → 190, `SIDEBAR_RIGHT_MAX` 380 → 420; RightArea dynamic minimum = 150 + 190 = 340 when sidebar is open

### Accessibility — Nested Button Fix

- **`<button>` → `<span role="button" tabIndex={0}>`** in LeftSidebar session action items (archive, restore, delete) — these were nested inside shadcn `SidebarMenuButton` (which renders as `<button>`), creating invalid HTML
- **Keyboard handlers added**: `onKeyDown` listeners for Enter/Space on all session action spans, matching the click behavior (archive, restore, delete, pin)

### Chat Composer Refinements

- **"+" context menu added**: new dropdown (Select file, Upload image, Add link placeholder, Add code snippet placeholder) in composer bottom-left
- **Slash command handling simplified**: any `/`-prefixed input triggers the first matching slash command on Enter
- Model label display, effort toggle buttons, and Portal-based model picker removed from composer — all consolidated into `AgentSettingsBar`

### Store Cleanup

- **`aiModel` and `effortLevel` removed** from global `AppSettings` in `settings-store` — these are now per-agent settings managed in `claude-chat-store`
- **`drawerState` removed** from `claude-chat-store` — chat drawer state machine eliminated
- `claude-chat-store` `sendPrompt` now passes `agentMode` and `effortLevel` to the `agent:send` IPC call

### Constants Update

- `SIDEBAR_RIGHT_MIN` 100 → 190, `SIDEBAR_RIGHT_MAX` 380 → 420 for better right sidebar usability
- New `SIDEBAR_RIGHT_MIN` import in `App.tsx` for dynamic RightArea minimum calculation

## 0.3.0 — 2026-05-28

### Architecture: TitleBar Removal, Per-Panel Toolbars
- **TitleBar removed** from top-level layout; replaced by `ContentTopBar` inside the center panel and `SidebarControls` inside LeftSidebar / RightArea toolbars
- Each panel now owns its own drag-region toolbar, eliminating the shared-titlebar architectural constraint
- `SidebarControls` extracted as reusable component (sidebar toggle + command palette trigger), rendered in LeftSidebar when expanded, in ContentTopBar or RightArea toolbar when collapsed
- **`-ml-[1px]` position compensation**: SidebarControls button shifts left by 1px when rendered in ContentTopBar or RightArea to cancel the separator width crossed during container transition, ensuring identical absolute position in all states
- New components: `ContentTopBar`, `SidebarControls`, `CommandPalette` (Cmd+K), `ProjectSwitcher`, `SidebarToolbar`, `MainToolbar`, `TabToolbar`, `Kbd`

### Layout: 1px Jitter Elimination
- **`sidebarFullyCollapsed` state** (flips at 0px, not 30px) decouples toolbar layout-switch timing from the `sidebarExpanded` 30px threshold — toolbar button position only changes when the panel is genuinely at zero, not mid-animation
- **Separator `w-0` removed**: left sidebar separator is always `w-px` and always visible, eliminating the drag handle that disappeared during collapse (preventing drag-back) and the 1px layout shift during collapse/expand
- **`contain:layout` removed** from `[data-panel]` CSS — forces panels into independent formatting contexts, causing sub-pixel misalignment at panel boundaries (documented in `layout.css` comment)
- **`translateZ(0)` GPU hacks removed** from ContentTopBar and RightArea toolbar — same sub-pixel jitter mechanism as `contain:layout`
- **`sidebarWidth` clamped to `SIDEBAR_LEFT_MAX`** on save and restore, preventing oversized panel restoration after project switch
- **`overflow-hidden` on sidebar panel** prevents clipped SidebarControls from flickering during collapse animation
- Sidebar `minSize` increased 160→190 for better minimum usability

### Layout: Sidebar Overlay Fix
- **Safety net added**: on wide windows (>500px), `leftSidebarOverlay` is always cleared — prevents fullscreen portal overlay from persisting after project switch or window resize
- **Explicit `setLeftSidebarOverlay(false)` on expand** — overlay was never cleared in the expand code path, causing the sidebar to render as a full-screen portal even after expanding

### Right Sidebar: Constraint Fix
- Right sidebar inner panel `maxSize` 40%→80% — at narrow RightArea widths (250px), 40% = 100px < minSize (180px), creating an impossible constraint that froze the panel
- `SIDEBAR_RIGHT_MIN` 180→100 — combined minimum (right-main 150 + separator 1 + sidebar 100 = 251) fits within `RIGHT_AREA_MIN` (250)
- `RIGHT_AREA_MIN` 350→250 for better narrow-window behavior

### UI/UX: Centering & Spacing
- **BottomBar hidden** (`display: none`) — preserved in codebase for future re-enablement
- Homepage vertical centering compensated: `@xl:pb-[var(--height-titlebar)]` adds phantom bottom space equal to ContentTopBar height, re-centering the welcome dialog
- Chat Messages empty state compensated: `pb-[calc(2rem+var(--height-status-bar))]` offsets missing BottomBar height
- Homepage and chat view bottom spacing unified — `gap-1` removed from homepage, `pb-2` added to mode selector — composer now sits at identical position regardless of empty/active state

### Session Management
- **Session pinning**: pin/unpin sessions to top of list with dedicated Pinned section
- **Session archiving**: archive/restore/delete sessions with toggle between active and archived views
- **Session sorting**: sort by last updated or date created
- Session list fetches on project open, stream completion, and new session creation events

### Chat Composer
- Composer layout refined: toolbar bar moved above textarea, send button relocated to bottom-right
- Agent selector and mode selector extracted from TitleBar into homepage/chat-view inline dropdowns

## 0.2.10 — 2026-05-26

### Layout System — Critical Bug Fixes
- **RightArea overlap fix**: removed `groupResizeBehavior="preserve-pixel-size"` from rightArea Panel that caused rightArea to resist shrinking and visually overlap the center AI Chat panel when dragging LeftSidebar wider
- **Minimize/Restore fix**: save rightArea width in maximize button onClick *before* calling `c.collapse()`, preventing the stored width from being polluted by the post-collapse redistributed full-width value; restore button uses `c.expand()` + `r.resize(store.rightAreaWidth)` for deterministic recovery
- **Separator unlocked**: removed `disabled={editorMaximized}` from center-rightArea separator, allowing users to drag back from maximized state instead of being trapped
- **RightArea initial state fix**: `defaultSize` changed from persisted width to `0`, preventing constraint violations on layout remount in narrow windows that caused rightArea to show instead of AI Chat after project switch
- **LeftSidebar narrow-window fix**: `useEffect` → `useLayoutEffect` for overlay threshold check so collapse runs before paint; `expand()` replaced with `resize(persistedWidth)` for reliable restore; conditional `defaultSize` returns `0` below 500px window width to prevent sidebar rendering inline on project switch in narrow windows

### ACP Agent
- Session resume support: agent manager accepts optional `sessionIdToResume` parameter for restoring previous sessions
- Path traversal security: `readTextFile` validates that resolved paths stay within project directory
- Throttled stderr forwarding to renderer (max 1 event per second)
- Close tab now cancels running prompt and kills agent session process

### AI Chat
- Expanded tool widgets with structured outputs (Write, Edit, MultiEdit, Bash, TodoWrite, NotebookEdit, etc.)
- Thinking duration cached and displayed for loaded sessions
- Tab bar drag-and-drop reorder, improved close-tab index calculation
- System prompt cleaner utility strips metadata blocks before display
- Runtime provider simplified with ref-based streaming guard

### Editor
- New changes-bar component showing proposed diffs (accept/reject per file or all)
- Editor toolbar enhanced with compile, PDF toggle, and changes controls
- Changes store tracks last-active and auto-clears on project switch

### Chat Tab Bar
- Drag-and-drop tab reorder with `onReorder` callback
- Improved overflow scrolling and active-tab auto-scroll-into-view
- Empty-state hidden when no tabs exist

## 0.2.9 — 2026-05-26

### Settings Page
- Unified Settings page accessible from titlebar gear button and Welcome Page
- Left sidebar switches between Sessions and Settings navigation
- App-level settings: General (placeholder), Appearance, Shortcuts (placeholder)
- Project-level settings: Compiler, AI & APIs (visible only when project is open)
- Theme setting now syncs to both next-themes and electron-store
- Zotero API Key / User ID with encrypted persistence
- Compiler engine and auto-compile controls

### New Project Dialog
- Replace inline welcome-page form with Shadcn Dialog
- Project name input + location picker in single dialog
- Shared between Welcome Page and titlebar project dropdown

### Welcome Page
- Skip option to enter app without opening a project ("Skip for now")
- Independent AI Chat works without a project (cwd falls back to home dir)
- Welcome Page settings access hides Project section
- Responsive two-column layout (stacks vertically on narrow)
- Layout tightened: balanced column widths, compact buttons

### Left Sidebar
- Narrow-window overlay mode: below 500px sidebar opens as fullscreen overlay via Portal
- Overlay auto-closes on item selection (session / settings category)
- Width auto-persists across restarts via Zustand persist middleware
- Width restores on window widen (crossing threshold)

### Right Sidebar
- Width auto-persists across restarts

### Right Area
- Width auto-persists across restarts
- Left sidebar toggle simplified: no more Panel collapse/expand race conditions

### AI Chat
- Independent chat mode: sessions stored in home directory when no project
- Session list and deletion work without project
- Fixed: closeProject now cleans up all sub-stores (agent, tabs, sessions, PDF cache)

### UI
- Remove focus rings from Button, Input, Toggle, Select, Textarea
- Welcome Page settings gear button
- Titlebar settings gear toggles settings/sessions

### Fixes
- Sidebar width persisted and restored correctly on restart
- `closeProject` clears agent sessions and right panel tabs
- `leftSidebarRef` mobile collapse fixed for no-project layout
- Focus rings removed globally from interactive elements

## 0.2.8 — 2026-05-25

### Preview Mode — Overleaf-Style Writing Workspace
- New Preview tab kind: dedicated LaTeX writing mode with left editor + right PDF split
- Three-view toggle: split / TeX only / PDF only (Shadcn ToggleGroup)
- Right file tree locked to Manuscript in Preview mode; header mode selector locked
- File selection in Preview mode updates Preview tab directly — no tab switching
- Compile completion auto-switches to Preview tab with the compiled file
- PreviewToolbar module: compile, auto-compile, compile log (Sheet), view toggle

### Tab-Driven Architecture
- Preview mode driven by `activeTab.kind === "preview"`, not global toolbar state
- Closing Preview tab exits Preview mode cleanly — no layout residual
- Tab kind syncs toolbar mode button highlighting
- Add `openPreviewFile` and `switchToPreview` store methods

### TabBar Component
- Extract TabBar to standalone component with drag-to-reorder and horizontal scroll
- Right-click context menu: Close / Close Others
- Drop zone indicators for drag insertion points

### Right Pane System
- Extract `RightPane` and `PaneContent` — tab kind → content resolution
- Viewer registry: `.tex` → LaTeX editor, `.pdf` → PDF viewer

### Improvements
- PDF viewer: single-page PDF vertically centered in viewport
- Toolbar: mode buttons and tools protected from shrinking; `overflow-x-auto` fallback
- Auto-compile icon matches bottom bar (ZapIcon / ZapOffIcon)

### Removed
- `pdfPreviewOpen` boolean — replaced by tab-driven Preview mode
- Dead `markUsed` code in right-panel-store

### Fixed
- TabBar tab hover cursor now shows default (was text I-beam)
- `compileFile` and document store `activeFile` sync cover both file and preview tab kinds

## 0.2.7 — 2026-05-25

### Mobile Responsive Layout
- Window narrows to <768px: sidebars auto-collapse, center fills screen
- Mobile RightArea open: auto-maximize (RightArea fills window)
- Mobile minimize/close: return to Center-only view
- shadcn Sidebar Sheet overlay replaces persistent sidebar on mobile
- Min window width 393px (iPhone 16)

### Pane System (Split View)
- Rewrite `right-panel-store`: flat tabs → `panes[].tabs[]` hierarchy
- Multi-pane rendering via `react-resizable-panels` Group with separators
- `splitPane(direction, tabId)` — creates new pane, moves tab
- `closePane(id)` — merges tabs into remaining pane
- `moveTab(paneId, fromIndex, toIndex)` — reorder within pane
- `RightPane` component: TabBar + Content per pane

### Tab Bar
- Extract TabBar to standalone component with horizontal scroll (`overflow-x-auto`)
- Remove toolbar-level TabBar — tabs live in each Pane

### Code Organization
- Extract placeholder components to module files:
  - `modules/editor/no-file-open.tsx`
  - `modules/git/git-placeholder.tsx`
  - `modules/browser/browser-placeholder.tsx`

### Fixes
- LeftSidebar collapse while maximized: RightArea fills freed space (avoids Center reappearing)
- RightSidebar drag-close then click: single click to reopen (onResize syncs `rightSidebarOpen`)
- Narrow-window close RightArea/Minimize: use `resize(9999)` instead of `expand()` (avoids stale memory)
- Center Panel `minSize` 200→300 (more comfortable minimum)
- Chat empty state moves to bottom on narrow Center panel (container query `@xl`)

## 0.2.6 — 2026-05-24

### Resizable Panel Architecture
- Migrate from custom resize handlers to `react-resizable-panels` v4 for smooth, native-feel panel resizing
- Nested Group layout: LeftSidebar in outer Group, Center + RightArea in inner Group within MainArea wrapper
- Panel API is the single source of truth; Zustand is a read-only mirror synced via `onResize` callbacks
- Buttons call only Panel API (`collapse`/`expand`/`resize`), never write to Zustand directly
- Remove `closeEditorTab` interfering with `editorMaximized` state

### Panel Configuration
- LeftSidebar: `preserve-pixel-size`, collapsible, 160–35% (default 240px)
- RightArea: `preserve-pixel-size`, collapsible, 350px min (default 650px), auto-collapses on mount
- Center: flexible (no preserve-pixel-size), collapsible, 200px min
- RightSidebar: `preserve-pixel-size`, collapsible, 180px–40% (default 220px)

### Maximize / Minimize
- Maximize: collapses Center, RightArea fills remaining space (respects LeftSidebar boundary)
- Minimize: restores Center and RightArea to previous side-by-side widths
- Collapsing LeftSidebar while maximized: RightArea auto-expands to fill freed space

### Separator Design
- 1px visible separator line (`bg-border`), hover changes to `primary/40`
- 5px hit area via `resizeTargetMinimumSize` for easy grabbing
- Removed shadcn Sidebar panel border lines that caused double-border artifacts

### Self-Protection
- Each panel auto-collapses when squeezed below its minimum width (prevents constraint violations on narrow windows)

### AI Fab
- Moved from individual tab renderers to RightMainArea outer level; appears on all tabs when maximized

## 0.2.5

### Theme System — Clean & Connect
- Clean dead scale variables from tokens.css: spacing, icon, radius, shadow scales (unused parallel system)
- Move height base scale to globals.css @theme with two-tier chain (base → component token → component)
- Replace z-index CSS variables with Tailwind z-10/z-20/z-50 directly
- Document design system architecture in globals.css: which scale lives where
- Add spacing base unit control point (--spacing: 0.25rem) and animation durations in @theme
- Remove duplicate --layout-resize-handle, remove unused CSS layout variables
- Add Z-Index layer documentation to all module token files

### Phase 4 Completion
- Heights: 15 component tokens derive from 5 base values, each independently overridable
- Typography: 30 font tokens across 6 module files, Tailwind text-xs/text-sm connected to base scale
- Layout: resize handle width centralized, sidebar/panel widths in constants.ts
- Z-Index: 4 documented layers (z-10/z-20/z-50/z-9999) with per-module component mapping

## 0.2.4

### Sidebar Rewrite
- Rewrite left sidebar (Sessions) with shadcn Sidebar components: SidebarMenu, SidebarMenuButton, SidebarMenuAction
- Rewrite right sidebar (Files/Git/Browser) with shadcn SidebarMenu + SidebarMenuSub for file tree nesting
- Separate right sidebar into scenario components: FilesSidebar, GitSidebar, BrowserSidebar
- Add "All" mode to file tree mode selector with separator
- Apply design token font sizes and heights throughout

### Bug Fixes
- Fix duplicate tab creation when clicking already-open files — now switches to existing tab
- Decouple editor content from file tree active state — clicking blank tree area no longer clears editor
- Fix file tree filter logic — mode directories no longer appear as empty tree nodes
- Fix other mode directories (vault, code, assets, etc.) after filter refactor

### UI Improvements
- Compact file tree items: smaller icons (12px), reduced padding (py-0.5, h-6), tighter gap (0.5)
- Remove vertical indent border on nested folders — full-width hover/active backgrounds
- Left sidebar delete button uses shadcn showOnHover pattern

### Architecture
- Four-layer component structure: ui/ (atoms) → modules/ → layout/ → app
- Add barrel exports (index.ts) per module for clean imports
- Move dead code to components/__archive/ (tsconfig excluded)

## 0.2.3

### Component Restructuring
- Reorganize components into four-layer architecture: ui (atoms) → modules → layout → app
- Move all feature modules under `components/modules/`: editor, preview, chat, project, shared
- Add barrel exports (`index.ts`) per module — external code imports from module boundary only
- Isolate dead code into `components/__archive/` (excluded from tsconfig):
  - Full CodeMirror editor with merge view (879 lines)
  - Workspace sidebar with file tree + TOC (821 lines)
  - Editor toolbar, search panel, tab bar, AI change panel

### Dead Code Removal
- Remove `workspace-layout.tsx` (zero imports)
- Remove `welcome/welcome-screen.tsx` (106 lines, duplicate, zero imports)
- Remove `workspace/preview/pdf-preview.tsx` (407 lines, duplicate, zero imports)
- Delete empty directories: `workspace/`, `welcome/`, `assistant-ui/`

## 0.2.2

### IPC Cleanup
- Remove legacy `ipc-claude.ts` — replaced by ACP-based `agent.ts`
- Strip `ipc-` prefix from IPC filenames: `ipc-agent.ts` → `agent.ts`, etc.
- Remove legacy Claude API from preload (`claude:status/send/cancel` etc.) and type declarations
- Remove legacy Claude events (`onClaudeStream/Complete/Stderr`, `removeClaudeListeners`)

## 0.2.1

### Design Token System
- Centralized three-tier token architecture: Base Scale → Module Token → Component
- `styles/tokens.css`: base scale for heights, fonts, spacing, icons, radius, shadow, z-index, animation
- `styles/tokens/layout.css`: TitleBar, Sidebars, BottomBar, RightArea tokens
- `styles/tokens/editor.css`: CodeMirror, tabs, file tree, search panel tokens
- `styles/tokens/preview.css`: PDF viewer, preview controls tokens
- `styles/tokens/chat.css`: messages, composer, sessions, tool widgets tokens
- `styles/tokens/project.css`: welcome page, dialogs tokens
- `styles/tokens/shared.css`: cross-module tokens (timestamp, kbd, path, error)
- `styles/constants.ts`: centralized behavioral parameters

### Heights
- 5 raw values replaced with 15 per-component tokens
- Each toolbar, header, and bar independently controllable from a single source

### Typography
- All hardcoded `text-[Npx]`/`text-xs`/`text-sm` replaced with 30 component-level font tokens
- 11 shadcn/ui components connected to font base scale
- Each UI element mapped to a specific token under `tokens/*.css`

### Layout
- Sidebar/panel default widths, resize handle centralized in `constants.ts`
- Moved `sidebarItem` preset inline, removed `design-tokens.ts` and `sidebar-presets.ts`

### Z-Index
- 29 scattered z-index values replaced with 4-layer stack: `z-base` | `z-above` | `z-overlay` | `z-top`
- Module-level documentation in each `tokens/*.css` showing which components use which layer

## 0.2.0

### Welcome Page
- Added global welcome page when no project is open
- New Project form: select location + name, auto-scaffolds project structure
- Recent Projects list with existence check (grayed out if missing, removable)
- Auto-restore last project on app launch
- Close project button in titlebar returns to welcome page
- Minimal titlebar on welcome page with theme toggle and settings

### Project Structure
- `.prismnext/` hidden directory for project metadata
- Scaffolded directories: `manuscript/`, `vault/`, `code/`, `assets/`, `zotero/`, `other/`
- Internal structure: `settings.json`, `state.json`, `.gitignore`, `sessions/`, `compile/`
- Project setup dialog (Shadcn) prompts to scaffold missing directories when opening non-project folders
- Compile output directed to `.prismnext/compile/`
- Settings saved per-project via electron-store

### AI Chat (Left Area)
- Removed ChatTabBar; session switching via Left Sidebar only
- Centered homepage with composer when no messages
- Agent/Model selector on homepage composer
- Agent mode selector: Edit before ask / Auto edit / Plan mode
- Project dropdown in homepage toolbar (shared with titlebar)
- Session list with delete; deleting current session navigates to recent or homepage
- System prompt and local-command messages filtered from chat display
- Thinking block deduplication at tool call boundaries
- Session ID synced from agent events for proper delete-navigate flow

### Right Area
- Unified toolbar: Files/Git/Browser icon tabs + inline file tabs
- Extensible tab system (`right-panel-store`): supports file, browser, git-overview, git-diff
- Initial tab concept: reuse empty tab before creating new ones
- "+" button dropdown: New File types + New Tab (Files/Git/Browser)
- Compile button, maximize, sidebar toggle in toolbar
- Mode switcher (Manuscript/Vault/Code/Assets/Other) in Files dropdown
- Viewer registry: extension → component mapping (`.tex` → editor, `.pdf` → PDF viewer)
- RightSidebar closes by default

### UI Polish
- Unified border-radius (`rounded`) across titlebar, toolbar, and dropdowns
- Right Area toolbar height matches titlebar (38px)
- Git branch indicator moved from titlebar to bottom bar
- Search bar replaced with ⌘K button on titlebar
- Titlebar layout: `[⌘K] [Theme] | [More] [RightArea]`
- Removed unused Right Area bottombar

### Fixes
- Local command messages filtered at JSONL load time
- Session titles no longer show system content
- `process.env` → `import.meta.env` for Vite renderer compatibility
- TypeScript compilation errors resolved


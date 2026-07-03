# Prompt System Redesign

> **Historical — injection paths:** Layer architecture remains valid; current runtime wiring and Agent/Orchestrator profile split are documented in **`2026-07-03-agent-prompt-stack-design.md`**.

**Date:** 2026-06-19
**Status:** Design approved — ready for implementation planning
**Project:** prism-next

---

## 1. Problem Statement

The current prompt system in prism-next has severe structural issues:

1. **No abstraction** — Raw string concatenation: `[core, modules, workspace].join("\n\n")`. No layers, priorities, or enable/disable flags.
2. **User override replaces everything** — `agentSystemPrompt || defaultAgentPrompt` means writing any custom prompt loses ALL built-in Prism functionality.
3. **Modules defined but not activated** — Four domain modules exist but `ACTIVE_MODULES = []` means none are injected.
4. **Workspace folders are hacked in** — A fragile `require()` call with no caching mixes workspace descriptions directly into the prompt.
5. **AGENTS.md not injected** — The project-level instruction file exists but is invisible to the agent.
6. **No versioning or metadata** — Core prompt is a bare string, unmanageable at scale.
7. **`contextComponents` is dead code** — The IPC interface exists but is disconnected from prompt assembly.
8. **No separation of concerns** — App-level, project-level, and user-level prompts are all mushed together.

---

## 2. Design Goals

1. **Layered stacking** — Each layer appends, never replaces. Higher layers can be toggled but not silently dropped.
2. **Unified assembly** — All prompts assembled in one place (main process `PromptManager`).
3. **Workspace folders → prompt system** — Functional folder descriptions go through the formal module system, not a side channel.
4. **Global module switches** — Each domain module has a global on/off toggle.
5. **AGENTS.md auto-discovery** — `.prismnext/agent/AGENTS.md` is auto-read and injected as a project layer.
6. **User override = append, not replace** — User custom instructions are added AFTER all built-in content.
7. **Layered caching** — Static layers pre-computed once; dynamic layers recomputed only on context change.
8. **OpenCode separation** — Skills and MCP remain OpenCode-native. Prism only manages its own domain prompts.

---

## 3. Architecture

### 3.1 Layer Stack (4 layers)

| Priority | Layer ID | Source | Toggleable | Content |
|----------|----------|--------|------------|---------|
| 0 | `core-persona` | app | No | Prism core behavior rules. Always present. |
| 1 | `modules` | app | Per-module | All enabled modules, joined. Includes `workspace-folders` module. |
| 2 | `agents-md` | project | Yes | Contents of `.prismnext/agent/AGENTS.md`. |
| 3 | `user-override` | user | Yes | User's custom additional instructions. |

### 3.2 Modules (content units under Layer 1)

Each module is a structured object with metadata:

```ts
interface PromptModule {
  key: string;          // "workspace-folders", "citations", etc.
  label: string;        // Human-readable name
  description: string;  // Shown in settings UI
  enabled: boolean;     // Global toggle state
  source: "app" | "project" | "plugin";  // Origin
  // EITHER static text:
  prompt?: string;
  // OR dynamic builder:
  build?: (ctx: PromptContext) => string;
}
```

**Registered modules:**

| Key | Source | Default | Type | Description |
|-----|--------|---------|------|-------------|
| `workspace-folders` | project | **on** | dynamic | Auto-generated from workspace config. THE primary real module. |
| `academic-writing` | app | off | static | Example: sectioning, abstracts, cross-refs. |
| `citations` | app | off | static | Example: BibTeX, BibLaTeX, cite commands. |
| `figures-tables` | app | off | static | Example: floats, captions, booktabs. |
| `math-equations` | app | off | static | Example: AMS packages, align, matrices. |

`workspace-folders` is the only module enabled by default. The other four are example templates that users can enable globally.

### 3.3 PromptContext

```ts
interface PromptContext {
  projectRoot?: string;
  workspaceDirs?: WorkspaceFolder[];
  agentsMdContent?: string;
  userCustomPrompt?: string;
}
```

### 3.4 Assembly Flow

```
chat:send handler (main process)
  │
  ├─ buildPromptContext(projectRoot)
  │   ├─ readWorkspaceDirs(.prismnext/settings.json)
  │   ├─ readFile(.prismnext/agent/AGENTS.md)
  │   └─ getSettings().agentSystemPrompt
  │
  └─ promptManager.compose(ctx)
      │
      ├─ Layer 0: CORE_PERSONA_PROMPT     (static cache)
      ├─ Layer 1: enabled modules          (static + dynamic)
      │   └─ workspace-folders build(ctx)  (dynamic)
      ├─ Layer 2: AGENTS.md               (dynamic)
      └─ Layer 3: User Override            (dynamic)
      │
      └─ → systemPrompt → ACP session/prompt
```

---

## 4. File Structure

```
src/main/prompts/
├── index.ts                     # PromptManager singleton + public API
├── composer.ts                  # PromptComposer — layered assembly engine
├── types.ts                     # All type definitions
├── context.ts                   # buildPromptContext — collects all data
├── layers/                      # Layer implementations
│   ├── core-persona.ts          # Layer 0
│   ├── active-modules.ts        # Layer 1 — collects enabled module prompts
│   ├── agents-md.ts             # Layer 2
│   └── user-override.ts         # Layer 3
├── modules/                     # Module content definitions
│   ├── index.ts                 # ALL_MODULES registry + exports
│   ├── workspace-folders.ts     # buildWorkspacePrompt() — the real module
│   ├── academic-writing.ts      # Example module
│   ├── citations.ts             # Example module
│   ├── figures-tables.ts        # Example module
│   └── math-equations.ts        # Example module
└── core/
    └── prism-agent.ts           # Raw core prompt text
```

---

## 5. Key Components

### 5.1 PromptComposer

- Maintains ordered list of `PromptLayer` instances.
- `register(layer)` / `unregister(id)` / `setEnabled(id, bool)`.
- `compose(ctx)` → assembled string.
- Two-tier caching:
  - **Static cache**: Layers with `source === "app"` pre-computed once on init.
  - **Context cache**: Keyed by `JSON.stringify(ctx)` hash. Same context → same result.
- `invalidateCache()` called when settings change.

### 5.2 PromptManager (singleton)

- Single global instance. Initialized once in `app.whenReady()`.
- Public API:
  - `initialize()` — registers all 4 layers + all modules.
  - `compose(ctx)` → delegates to PromptComposer.
  - `getModules()` → returns module list with toggle states for the settings UI.
  - `setModuleEnabled(key, bool)` → toggles a module + marks for persistence.
  - `loadModuleStates(states)` / `dumpModuleStates()` → persistence round-trip.
  - `invalidate()` → clears all caches.

### 5.3 buildPromptContext

Helper function in `context.ts`. Collects all dynamic data from:

| Data | Source |
|------|--------|
| `workspaceDirs` | `.prismnext/settings.json` via `readWorkspaceDirs()` |
| `agentsMdContent` | `.prismnext/agent/AGENTS.md` (best-effort read) |
| `userCustomPrompt` | `AppSettings.agentSystemPrompt` via `getSettings()` |

---

## 6. Integration Points

### 6.1 IPC Changes

| IPC Channel | Change |
|-------------|--------|
| `chat:send` | **Main process now assembles systemPrompt internally.** Renderer no longer passes it. |
| `settings:getDefaultAgentPrompt` | Now calls `promptManager.compose(ctx)`. Used by settings UI for preview. |
| `settings:getModules` | 🆕 Returns module list with toggle states. |
| `settings:setModule` | 🆕 Toggles a module on/off. Persists to AppSettings. |
| `settings:set` | If `agentSystemPrompt` in patch → calls `promptManager.invalidate()`. |

### 6.2 Renderer Changes

- **chat-store.ts**: Remove `systemPrompt` from `chatSend()` args. No longer manages prompt content.
- **settings-store.ts**: Remove `defaultAgentPrompt` field and `loadDefaultPrompt()` method. Prompt assembly is main-process-only.

### 6.3 Persistence

- Module states stored in `AppSettings.promptModules: Record<string, boolean>`.
- Persisted via `electron-store` (encrypted where applicable).
- Workspace folders and AGENTS.md are project-level, stored in `.prismnext/`.

### 6.4 Startup Flow

```
app.whenReady()
  ├─ getSettings() → load AppSettings from electron-store
  ├─ promptManager.initialize()           # register all 4 layers + 5 modules
  ├─ promptManager.loadModuleStates(
  │     settings.promptModules || { "workspace-folders": true }
  │   )                                   # restore toggle states
  └─ promptManager.composer.preComputeStatic()  # pre-cache static layers
```

### 6.6 Cache Invalidation

| Trigger | Action |
|---------|--------|
| User edits Agent System Prompt | `settings:set` → `promptManager.invalidate()` |
| User toggles a module | `settings:setModule` → `promptManager.composer.invalidate()` |
| Workspace config changes | Next `chat:send` reads fresh workspace data → context hash changes → recompute |
| AGENTS.md edited | Next `chat:send` reads fresh file → context hash changes → recompute |

---

## 7. Settings UI

### Agent Settings Page

```
┌── Settings → Agent ──────────────────────────────────┐
│                                                       │
│  System Prompt                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Additional instructions (appended after default)  │ │
│  │ [user types custom instructions here...]          │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  Prompt Modules                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ [✓] Workspace Folder Descriptions   (auto, on)   │ │
│  │ [ ] Academic Writing                (example)    │ │
│  │ [ ] Citations & Bibliography        (example)    │ │
│  │ [ ] Figures & Tables                (example)    │ │
│  │ [ ] Math & Equations                (example)    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  Assembled Prompt Preview   [collapsed by default]     │
│  ┌──────────────────────────────────────────────────┐ │
│  │ ## Role                                            │ │
│  │ You are an AI assistant...                         │ │
│  │ ...                  [Copy] [Refresh]              │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
└───────────────────────────────────────────────────────┘
```

---

## 8. Boundary: Prism vs OpenCode

```
┌── Prism Prompt System ──────┐  ┌── OpenCode Native ──────────┐
│                              │  │                             │
│  Layer 0: Core Persona       │  │  Skills (SKILL.md files)    │
│  Layer 1: Modules            │  │  MCP Servers (tools+prompt) │
│    ├─ workspace-folders      │  │  Tool use / Permissions     │
│    ├─ citations (example)    │  │  Safety rules               │
│    └─ ...                    │  │  Agent base personality     │
│  Layer 2: AGENTS.md          │  │                             │
│  Layer 3: User Override      │  │                             │
│                              │  │                             │
│  → systemPrompt parameter    │  │  → additionalDirectories    │
│                              │  │  → mcpServers parameter     │
└──────────────────────────────┘  └─────────────────────────────┘
```

- Prism owns LaTeX domain knowledge, project structure, and user preferences.
- OpenCode owns skills loading, MCP tool management, and agent behavior.
- Prism tells OpenCode WHERE to find skills (`additionalDirectories`) and MCP configs (`mcpServers`), but does not manage their content.

---

## 9. File Change Manifest

| Op | File |
|----|------|
| 🆕 | `src/main/prompts/types.ts` |
| 🆕 | `src/main/prompts/composer.ts` |
| 🆕 | `src/main/prompts/context.ts` |
| 🆕 | `src/main/prompts/layers/core-persona.ts` |
| 🆕 | `src/main/prompts/layers/active-modules.ts` |
| 🆕 | `src/main/prompts/layers/agents-md.ts` |
| 🆕 | `src/main/prompts/layers/user-override.ts` |
| 🆕 | `src/main/prompts/modules/workspace-folders.ts` |
| 🔄 | `src/main/prompts/index.ts` (rewrite to PromptManager) |
| 🔄 | `src/main/prompts/modules/index.ts` (PromptModule format) |
| 🔄 | `src/main/prompts/core/prism-agent.ts` (simplify) |
| 🔄 | `src/main/ipc/chat.ts` (assemble systemPrompt in handler) |
| 🔄 | `src/main/ipc/settings.ts` (new module IPC, cache invalidation) |
| 🔄 | `src/main/services/settings.ts` (promptModules field) |
| 🔄 | `src/main/index.ts` (init PromptManager) |
| 🔄 | `src/renderer/stores/chat-store.ts` (remove systemPrompt arg) |
| 🔄 | `src/renderer/stores/settings-store.ts` (remove defaultAgentPrompt) |
| 🔄 | `src/preload/index.ts` (update API surface) |
| 🔄 | `src/renderer/types/electron.d.ts` (update types) |
| 🆕 | `src/renderer/components/modules/settings/module-settings.tsx` |
| 🆕 | `src/renderer/components/modules/settings/prompt-preview.tsx` |

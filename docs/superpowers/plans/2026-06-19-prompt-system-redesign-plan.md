# Prompt System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current raw string concatenation prompt system with a layered architecture (PromptComposer + PromptManager) featuring global module toggles, workspace folder descriptions as a module, AGENTS.md auto-discovery, and user override that appends instead of replacing.

**Architecture:** 4-layer prompt stack (core-persona → modules → agents-md → user-override). PromptManager singleton assembles layers via PromptComposer with two-tier caching (static layers precomputed once; dynamic layers recomputed on context change). Main process owns all prompt assembly; renderer no longer manages system prompt content.

**Tech Stack:** TypeScript (strict), Node.js (Electron main process), Zustand (renderer stores)

## Global Constraints

- All new files in `src/main/prompts/` use ES module imports (no `require()`)
- Layer 0 (`core-persona`) is NEVER toggleable — always enabled
- Module toggle states are global (not per-project), persisted in `AppSettings.promptModules`
- `workspace-folders` module defaults to `enabled: true`; all other modules default to `enabled: false`
- Workspace folder descriptions go through the module system, NOT a separate layer
- User override appends AFTER all built-in content (does not replace)
- Skills and MCP remain OpenCode-native — Prism only tells OpenCode where to find them
- Cache invalidation: static layers cached forever; context cache keyed on JSON hash of PromptContext
- All `console.log` debug output uses `[prism]` prefix for grep-ability

---

## File Structure

```
src/main/prompts/
├── index.ts                     # PromptManager singleton + public API
├── composer.ts                  # PromptComposer — layered assembly engine
├── types.ts                     # All type definitions
├── context.ts                   # buildPromptContext — collects all data
├── layers/
│   ├── core-persona.ts          # Layer 0: CORE_PERSONA_PROMPT export
│   ├── active-modules.ts        # Layer 1: build fn — joins enabled module prompts
│   ├── agents-md.ts             # Layer 2: build fn — reads AGENTS.md
│   └── user-override.ts         # Layer 3: build fn — user custom text
├── modules/
│   ├── index.ts                 # ALL_MODULES registry (PromptModule[])
│   ├── workspace-folders.ts     # buildWorkspacePrompt(ctx) dynamic module
│   ├── academic-writing.ts      # Example module (static)
│   ├── citations.ts             # Example module (static)
│   ├── figures-tables.ts        # Example module (static)
│   └── math-equations.ts        # Example module (static)
└── core/
    └── prism-agent.ts           # CORE_PERSONA_PROMPT string constant
```

---

### Task 1: Define Types (`src/main/prompts/types.ts`)

**Files:**
- Create: `src/main/prompts/types.ts`

**Interfaces:**
- Produces: `PromptLayer`, `PromptModule`, `PromptContext`

- [ ] **Step 1: Write `types.ts`**

```ts
// prism-next/src/main/prompts/types.ts

import type { WorkspaceFolder } from "../../renderer/types/workspace";

/** Context passed to dynamic prompt builders. */
export interface PromptContext {
  projectRoot?: string;
  workspaceDirs?: WorkspaceFolder[];
  agentsMdContent?: string;
  userCustomPrompt?: string;
}

/** A single layer in the prompt stack. */
export interface PromptLayer {
  /** Unique identifier, e.g. "core-persona", "workspace-folders" */
  id: string;
  /** Ordering — lower numbers appear earlier in the final prompt */
  priority: number;
  /** Where this layer's content originates */
  source: "app" | "project" | "user" | "plugin";
  /** Can the user toggle this layer on/off? */
  userToggleable: boolean;
  /** Current enabled state */
  enabled: boolean;
  /** Build this layer's prompt text. Return "" to skip. */
  build: (ctx: PromptContext) => string;
}

/** A content module that can be toggled on/off globally. */
export interface PromptModule {
  /** Unique key, e.g. "citations", "workspace-folders" */
  key: string;
  /** Human-readable label for the settings UI */
  label: string;
  /** Description shown in the settings UI */
  description: string;
  /** Global toggle state */
  enabled: boolean;
  /** Origin of this module */
  source: "app" | "project" | "plugin";
  /** Static prompt text (mutually exclusive with build) */
  prompt?: string;
  /** Dynamic prompt builder (mutually exclusive with prompt) */
  build?: (ctx: PromptContext) => string;
}
```

- [ ] **Step 2: Verify no compile errors**

```bash
cd prism-next && npx tsc --noEmit src/main/prompts/types.ts 2>&1 | head -20
```

Expected: clear (or only unrelated project errors)

---

### Task 2: Create PromptComposer (`src/main/prompts/composer.ts`)

**Files:**
- Create: `src/main/prompts/composer.ts`

**Interfaces:**
- Consumes: `PromptLayer`, `PromptContext` from `./types`
- Produces: `PromptComposer` class with `register()`, `unregister()`, `setEnabled()`, `compose()`, `invalidate()`, `getLayers()`

- [ ] **Step 1: Write `composer.ts`**

```ts
// prism-next/src/main/prompts/composer.ts

import type { PromptLayer, PromptContext } from "./types";

export class PromptComposer {
  private layers: PromptLayer[] = [];

  /** Cached result for the last context. Keyed by JSON-stable hash. */
  private cacheKey: string | null = null;
  private cachedResult: string | null = null;

  /** Static cache: layers whose build() does NOT depend on context.
   *  Key = layer.id, Value = precomputed result string ("" = skip). */
  private staticCache: Map<string, string> = new Map();

  // ── Registration ──────────────────────────────────────────

  /** Register a layer. Re-sorts by priority. */
  register(layer: PromptLayer): void {
    this.layers.push(layer);
    this.layers.sort((a, b) => a.priority - b.priority);
    // Precompute static layers immediately
    this.tryPrecompute(layer);
  }

  /** Remove a layer by id. */
  unregister(id: string): void {
    this.layers = this.layers.filter((l) => l.id !== id);
    this.staticCache.delete(id);
    this.invalidate();
  }

  /** Enable or disable a layer by id. */
  setEnabled(id: string, enabled: boolean): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.enabled = enabled;
      this.invalidate();
    }
  }

  // ── Query ─────────────────────────────────────────────────

  /** Get all registered layers (for the settings UI). */
  getLayers(): readonly PromptLayer[] {
    return this.layers;
  }

  // ── Composition ───────────────────────────────────────────

  /** Assemble the final prompt string from all enabled layers. */
  compose(ctx: PromptContext): string {
    const key = this.computeCacheKey(ctx);
    if (key === this.cacheKey && this.cachedResult !== null) {
      return this.cachedResult;
    }

    const parts: string[] = [];

    for (const layer of this.layers) {
      if (!layer.enabled) continue;

      // Static cache hit — use precomputed result
      const cached = this.staticCache.get(layer.id);
      if (cached !== undefined) {
        if (cached) parts.push(cached);
        continue;
      }

      // Dynamic layer — call build()
      try {
        const result = layer.build(ctx);
        if (result) parts.push(result);
      } catch (err) {
        console.warn(
          `[prism] PromptComposer: layer "${layer.id}" failed:`,
          (err as Error).message,
        );
      }
    }

    const assembled = parts.join("\n\n");
    this.cacheKey = key;
    this.cachedResult = assembled;
    return assembled;
  }

  /** Invalidate all caches. Call when settings or project data changes. */
  invalidate(): void {
    this.cacheKey = null;
    this.cachedResult = null;
  }

  /** Precompute all static layers. Call after registering all app-level layers. */
  preComputeStatic(): void {
    for (const layer of this.layers) {
      if (this.isStatic(layer)) {
        this.tryPrecompute(layer);
      }
    }
  }

  // ── Private ───────────────────────────────────────────────

  /** A layer is "static" if it doesn't depend on PromptContext. */
  private isStatic(layer: PromptLayer): boolean {
    return layer.source === "app" && layer.id !== "modules";
    // Layer "modules" is special: it contains `workspace-folders` which
    // IS context-dependent, so we treat "modules" as dynamic.
    // Individual app-source layers like "core-persona" are truly static.
  }

  private tryPrecompute(layer: PromptLayer): void {
    if (!this.isStatic(layer)) return;
    try {
      this.staticCache.set(layer.id, layer.build({}));
    } catch {
      // Will retry on compose()
    }
  }

  private computeCacheKey(ctx: PromptContext): string {
    // Stable hash: sort keys to avoid ordering differences
    const normalized: Record<string, unknown> = {
      pr: ctx.projectRoot ?? "",
      wd: ctx.workspaceDirs
        ? ctx.workspaceDirs.map((d) => `${d.name}:${d.function}:${(d as any).description ?? ""}`).sort()
        : [],
      amd: ctx.agentsMdContent?.length ?? 0,
      ucp: ctx.userCustomPrompt?.length ?? 0,
      en: this.layers.map((l) => `${l.id}=${l.enabled ? 1 : 0}`).join(","),
    };
    return JSON.stringify(normalized);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/prompts/composer.ts 2>&1 | head -20
```

Expected: no errors (or only pre-existing project errors)

---

### Task 3: Upgrade Modules Format (`src/main/prompts/modules/`)

**Files:**
- Modify: `src/main/prompts/modules/index.ts`
- Create: `src/main/prompts/modules/workspace-folders.ts`
- Keep unchanged (content only): `academic-writing.ts`, `citations.ts`, `figures-tables.ts`, `math-equations.ts`
- Keep unchanged (file exists): `src/main/prompts/core/prism-agent.ts`

**Interfaces:**
- Consumes: `PromptModule`, `PromptContext` from `../types`
- Produces: `ALL_MODULES: PromptModule[]`

- [ ] **Step 1: Rewrite `modules/index.ts`**

```ts
// prism-next/src/main/prompts/modules/index.ts

import type { PromptModule, PromptContext } from "../types";
import { ACADEMIC_WRITING_PROMPT } from "./academic-writing";
import { CITATIONS_PROMPT } from "./citations";
import { FIGURES_TABLES_PROMPT } from "./figures-tables";
import { MATH_EQUATIONS_PROMPT } from "./math-equations";
import { buildWorkspacePrompt } from "./workspace-folders";

/** All available prompt modules.
 *
 *  `workspace-folders` is the only module enabled by default — it generates
 *  functional folder descriptions from the project's workspace config.
 *
 *  The other four modules are EXAMPLE templates that users can enable
 *  globally via Settings → Agent → Prompt Modules. They are NOT injected
 *  unless the user explicitly turns them on.
 */
export const ALL_MODULES: PromptModule[] = [
  {
    key: "workspace-folders",
    label: "Workspace Folder Descriptions",
    description:
      "Auto-generated from project workspace configuration. " +
      "Tells the agent about each functional folder and its purpose.",
    enabled: true,
    source: "project",
    build: (ctx: PromptContext) =>
      ctx.workspaceDirs ? buildWorkspacePrompt(ctx.workspaceDirs) : "",
  },
  {
    key: "academic-writing",
    label: "Academic Writing",
    description: "Sectioning, abstracts, cross-references, footnotes, hyperref.",
    enabled: false,
    source: "app",
    prompt: ACADEMIC_WRITING_PROMPT,
  },
  {
    key: "citations",
    label: "Citations & Bibliography",
    description: "BibTeX, BibLaTeX, cite commands, bibliography management.",
    enabled: false,
    source: "app",
    prompt: CITATIONS_PROMPT,
  },
  {
    key: "figures-tables",
    label: "Figures & Tables",
    description: "Floats, captions, booktabs, subcaption, graphicx.",
    enabled: false,
    source: "app",
    prompt: FIGURES_TABLES_PROMPT,
  },
  {
    key: "math-equations",
    label: "Math & Equations",
    description: "AMS packages, align, matrices, theorem environments.",
    enabled: false,
    source: "app",
    prompt: MATH_EQUATIONS_PROMPT,
  },
];
```

- [ ] **Step 2: Create `modules/workspace-folders.ts`**

```ts
// prism-next/src/main/prompts/modules/workspace-folders.ts

import type { WorkspaceFolder } from "../../../renderer/types/workspace";
import {
  FOLDER_FUNCTION_ICONS,
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
} from "../../../renderer/types/workspace";

/** Build the prompt section describing functional workspace folders. */
export function buildWorkspacePrompt(dirs: WorkspaceFolder[]): string {
  if (!dirs || dirs.length === 0) return "";

  const lines = dirs.map((d) => {
    const label =
      d.function === "custom" && "customLabel" in d
        ? (d as any).customLabel || FOLDER_FUNCTION_LABELS.custom
        : FOLDER_FUNCTION_LABELS[d.function];

    const desc =
      d.description ||
      DEFAULT_FUNCTION_DESCRIPTIONS[d.function] ||
      "User-defined folder";

    const icon = FOLDER_FUNCTION_ICONS[d.function] || "";

    // Include mainTex info for manuscript folders
    const extra =
      d.function === "manuscript" && "mainTex" in d
        ? ` (main file: \`${(d as any).mainTex}\`)`
        : "";

    return `- \`${d.name}/\` ${icon} **${label}**${extra}: ${desc}`;
  });

  return (
    "## Project Structure\n\n" +
    "The project has the following functional folders. " +
    "Use this structure to organize files and understand the project layout:\n\n" +
    lines.join("\n")
  );
}
```

- [ ] **Step 3: Verify the existing module files still export compatible strings**

Confirm these exports exist (they already do — no changes needed):
- `academic-writing.ts` → `export const ACADEMIC_WRITING_PROMPT`
- `citations.ts` → `export const CITATIONS_PROMPT`
- `figures-tables.ts` → `export const FIGURES_TABLES_PROMPT`
- `math-equations.ts` → `export const MATH_EQUATIONS_PROMPT`

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/prompts/modules/index.ts 2>&1 | head -20
```

Expected: no errors

---

### Task 4: Create Layer Implementations (`src/main/prompts/layers/`)

**Files:**
- Create: `src/main/prompts/layers/core-persona.ts`
- Create: `src/main/prompts/layers/active-modules.ts`
- Create: `src/main/prompts/layers/agents-md.ts`
- Create: `src/main/prompts/layers/user-override.ts`

**Interfaces:**
- Consumes: `PromptLayer`, `PromptContext`, `PromptModule` from `../types`; `ALL_MODULES` from `../modules`
- Produces: Four functions that each return a configured `PromptLayer`

- [ ] **Step 1: Write `layers/core-persona.ts`**

```ts
// prism-next/src/main/prompts/layers/core-persona.ts

/** Prism core persona prompt — always present, never toggleable.
 *
 *  This layer defines the agent's fundamental behavior rules for LaTeX editing.
 *  Domain-specific knowledge (citations, math, etc.) belongs in modules. */
export const CORE_PERSONA_PROMPT = [
  "## Role",
  "",
  "You are an AI assistant integrated into Prism — a LaTeX academic paper writing workspace.",
  "",
  "## Core Rules",
  "",
  "1. **Plan first**: Before making changes, use TodoWrite to create a step-by-step plan. ",
  "   Break large tasks into small, incremental steps (one section or one logical unit per step).",
  "2. **Incremental edits**: Use the Edit tool to make small, targeted changes — one step at a time. ",
  "   NEVER write or rewrite an entire file at once. Always prefer editing existing content.",
  "3. **Read before editing**: Always read the file first. Keep the existing preamble, packages, ",
  "   and structure intact. Only add or modify what is needed for the current step.",
  "4. **Step by step**: After each edit, mark the todo item as completed, then proceed to the next step. ",
  "   This lets the user review changes incrementally.",
  "5. **LaTeX best practices**: Use proper sectioning (\\\\chapter, \\\\section, \\\\subsection), ",
  "   citations (\\\\cite), cross-references (\\\\label, \\\\ref), and BibTeX for bibliographies.",
  "6. **Python environment**: If .venv/ exists in the project, it is already activated. ",
  "   Use `uv pip install` to add packages and `python` to run scripts.",
].join("\n");

import type { PromptLayer } from "../types";

export function createCorePersonaLayer(): PromptLayer {
  return {
    id: "core-persona",
    priority: 0,
    source: "app",
    userToggleable: false,
    enabled: true,
    build: () => CORE_PERSONA_PROMPT,
  };
}
```

- [ ] **Step 2: Write `layers/active-modules.ts`**

```ts
// prism-next/src/main/prompts/layers/active-modules.ts

import type { PromptLayer, PromptContext } from "../types";
import { ALL_MODULES } from "../modules";

/** Layer 1: Collects and joins all enabled module prompts. */
export function createActiveModulesLayer(): PromptLayer {
  return {
    id: "active-modules",
    priority: 1,
    source: "app",
    userToggleable: true,
    enabled: true, // the LAYER is enabled; individual modules toggle inside
    build: (ctx: PromptContext) => {
      const enabled = ALL_MODULES.filter((m) => m.enabled);
      if (enabled.length === 0) return "";

      const parts: string[] = [];
      for (const mod of enabled) {
        try {
          let text: string;
          if (mod.build) {
            text = mod.build(ctx);
          } else if (mod.prompt) {
            text = mod.prompt;
          } else {
            continue;
          }
          if (text) parts.push(text);
        } catch (err) {
          console.warn(
            `[prism] Module "${mod.key}" failed:`,
            (err as Error).message,
          );
        }
      }

      return parts.length > 0 ? parts.join("\n\n") : "";
    },
  };
}
```

- [ ] **Step 3: Write `layers/agents-md.ts`**

```ts
// prism-next/src/main/prompts/layers/agents-md.ts

import * as path from "node:path";
import * as fs from "node:fs";
import type { PromptLayer, PromptContext } from "../types";

/** Layer 2: Project-level instructions from .prismnext/agent/AGENTS.md */
export function createAgentsMdLayer(): PromptLayer {
  return {
    id: "agents-md",
    priority: 2,
    source: "project",
    userToggleable: true,
    enabled: true,
    build: (ctx: PromptContext) => {
      if (!ctx.projectRoot) return "";
      const agentsPath = path.join(
        ctx.projectRoot,
        ".prismnext",
        "agent",
        "AGENTS.md",
      );
      try {
        if (fs.existsSync(agentsPath)) {
          const content = fs.readFileSync(agentsPath, "utf-8").trim();
          if (content) {
            return "## Project Instructions (AGENTS.md)\n\n" + content;
          }
        }
      } catch {
        // Best-effort: file may not exist or be unreadable
      }
      return "";
    },
  };
}
```

- [ ] **Step 4: Write `layers/user-override.ts`**

```ts
// prism-next/src/main/prompts/layers/user-override.ts

import type { PromptLayer, PromptContext } from "../types";

/** Layer 3: User's custom additional instructions — appended, not replacing. */
export function createUserOverrideLayer(): PromptLayer {
  return {
    id: "user-override",
    priority: 3,
    source: "user",
    userToggleable: true,
    enabled: true,
    build: (ctx: PromptContext) => {
      const text = ctx.userCustomPrompt?.trim();
      if (!text) return "";
      return "## Additional Instructions\n\n" + text;
    },
  };
}
```

**Task 4 cleanup note:** After creating `layers/core-persona.ts`, the old `core/prism-agent.ts` file is superseded. Its content has been moved into the layer. Remove `core/prism-agent.ts` once the layers compile successfully.

- [ ] **Step 5: Verify TypeScript compiles all layers**

```bash
cd prism-next && npx tsc --noEmit \
  src/main/prompts/layers/core-persona.ts \
  src/main/prompts/layers/active-modules.ts \
  src/main/prompts/layers/agents-md.ts \
  src/main/prompts/layers/user-override.ts 2>&1 | head -30
```

Expected: no errors

---

### Task 5: Build PromptManager Singleton (`src/main/prompts/index.ts`)

**Files:**
- Rewrite: `src/main/prompts/index.ts`

**Interfaces:**
- Consumes: `PromptComposer` from `./composer`; layer creators from `./layers/*`; `PromptModule`, `PromptContext` from `./types`
- Produces: `promptManager` singleton instance

- [ ] **Step 1: Rewrite `index.ts`**

```ts
// prism-next/src/main/prompts/index.ts

import { PromptComposer } from "./composer";
import type { PromptLayer, PromptModule, PromptContext } from "./types";
import { createCorePersonaLayer } from "./layers/core-persona";
import { createActiveModulesLayer } from "./layers/active-modules";
import { createAgentsMdLayer } from "./layers/agents-md";
import { createUserOverrideLayer } from "./layers/user-override";
import { ALL_MODULES } from "./modules";

class PromptManager {
  private composer = new PromptComposer();
  private initialized = false;
  private needsPersist = false;

  /** Register all layers and modules. Idempotent — safe to call multiple times. */
  initialize(): void {
    if (this.initialized) return;

    // Layer 0: Core persona (always on, never toggleable)
    this.composer.register(createCorePersonaLayer());

    // Layer 1: Active modules (layer itself is toggleable)
    this.composer.register(createActiveModulesLayer());

    // Layer 2: AGENTS.md
    this.composer.register(createAgentsMdLayer());

    // Layer 3: User override
    this.composer.register(createUserOverrideLayer());

    // Precompute static layers (core-persona)
    this.composer.preComputeStatic();

    this.initialized = true;
    console.log("[prism] PromptManager initialized");
  }

  // ── Public API ──────────────────────────────────────────

  /** Assemble the final prompt string from all enabled layers. */
  compose(ctx: PromptContext): string {
    this.initialize();
    return this.composer.compose(ctx);
  }

  /** Get all layers (for settings UI introspection). */
  getLayers(): readonly PromptLayer[] {
    this.initialize();
    return this.composer.getLayers();
  }

  /** Get all modules with their current toggle states. */
  getModules(): PromptModule[] {
    return ALL_MODULES.map((m) => ({ ...m }));
  }

  /** Toggle a module on/off. Marks for persistence. */
  setModuleEnabled(key: string, enabled: boolean): void {
    const mod = ALL_MODULES.find((m) => m.key === key);
    if (mod) {
      mod.enabled = enabled;
      this.composer.invalidate();
      this.needsPersist = true;
    }
  }

  /** Restore module states from persisted settings. */
  loadModuleStates(states: Record<string, boolean>): void {
    for (const [key, enabled] of Object.entries(states)) {
      const mod = ALL_MODULES.find((m) => m.key === key);
      if (mod) {
        mod.enabled = enabled;
      }
    }
    this.composer.invalidate();
    this.needsPersist = false;
  }

  /** Export current module states for persistence. */
  dumpModuleStates(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const m of ALL_MODULES) {
      result[m.key] = m.enabled;
    }
    return result;
  }

  /** Invalidate all caches. Call when settings or project data changes. */
  invalidate(): void {
    this.composer.invalidate();
  }

  /** Whether module states changed since last load/save. */
  get needsModulePersist(): boolean {
    return this.needsPersist;
  }
}

/** Singleton — the single entry point for all prompt assembly. */
export const promptManager = new PromptManager();
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/prompts/index.ts 2>&1 | head -20
```

Expected: no new errors

---

### Task 6: Create Context Builder (`src/main/prompts/context.ts`)

**Files:**
- Create: `src/main/prompts/context.ts`

**Interfaces:**
- Consumes: `PromptContext` from `./types`; `readWorkspaceDirs` from `../services/workspace-config`; `getSettings` from `../services/settings`
- Produces: `buildPromptContext(projectRoot?: string): Promise<PromptContext>`

- [ ] **Step 1: Write `context.ts`**

```ts
// prism-next/src/main/prompts/context.ts

import * as path from "node:path";
import * as fs from "node:fs";
import type { PromptContext } from "./types";
import type { WorkspaceFolder } from "../../renderer/types/workspace";

/** Safely read workspace dirs, returning [] on any error. */
function readWorkspaceDirsSafe(prismDir: string): WorkspaceFolder[] {
  try {
    // Inline to avoid circular dependency — workspace-config.ts
    // may import from prompts in the future.
    const settingsPath = path.join(prismDir, "settings.json");
    if (!fs.existsSync(settingsPath)) return [];
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (Array.isArray(raw.workspaceDirs) && raw.workspaceDirs.length > 0) {
      return raw.workspaceDirs;
    }
    // Default for fresh projects
    return [
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
    ] as WorkspaceFolder[];
  } catch {
    return [];
  }
}

/** Safely read a file, returning null on any error. */
function readFileIfExists(absPath: string): string | null {
  try {
    if (fs.existsSync(absPath)) {
      return fs.readFileSync(absPath, "utf-8");
    }
  } catch {}
  return null;
}

/**
 * Build the full PromptContext for a given project.
 * Called in the chat:send handler before composing the prompt.
 */
export async function buildPromptContext(
  projectRoot?: string,
): Promise<PromptContext> {
  const ctx: PromptContext = { projectRoot };

  if (projectRoot) {
    const prismDir = path.join(projectRoot, ".prismnext");

    // Workspace folder config
    ctx.workspaceDirs = readWorkspaceDirsSafe(prismDir);

    // AGENTS.md — project-level instructions
    ctx.agentsMdContent =
      readFileIfExists(path.join(prismDir, "agent", "AGENTS.md")) ?? undefined;
  }

  // User custom prompt from app-level settings
  try {
    const { getSettings } = require("../services/settings");
    const settings = getSettings() as Record<string, unknown>;
    const userPrompt = settings.agentSystemPrompt as string | undefined;
    ctx.userCustomPrompt = userPrompt || undefined;
  } catch {
    // settings may not be available during early startup
  }

  return ctx;
}
```

Note: `buildPromptContext` uses `require()` for `getSettings` to avoid circular dependencies at module load time. The module is always available when this function is called (it only runs during `chat:send`).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/prompts/context.ts 2>&1 | head -20
```

Expected: no new errors

---

### Task 7: Integrate into IPC (`src/main/ipc/chat.ts` + `src/main/ipc/settings.ts`)

**Files:**
- Modify: `src/main/ipc/chat.ts` (chat:send — assemble systemPrompt internally)
- Modify: `src/main/ipc/settings.ts` (add module IPC + cache invalidation on settings:set)

**Interfaces:**
- Consumes: `promptManager` from `../prompts`; `buildPromptContext` from `../prompts/context`
- Produces: Updated IPC handlers

- [ ] **Step 1: Modify `chat:send` in `ipc/chat.ts`**

In the `chat:send` handler (around line 59-150), add prompt assembly BEFORE `sendPrompt`. Insert after `setConfigOption` for thought level, before the `sendPrompt` call.

Find this block (around line 131-145):
```ts
      log.info(`Sending prompt: sessionId=${sessionId} tabId=${tabId} promptLen=${args.prompt.length}`);
      let usage = null;
      try {
        const result = await service.sendPrompt(sessionId, args.prompt, {
          model: args.model,
          provider: args.provider,
          systemPrompt: args.systemPrompt,
        });
```

Replace `args.systemPrompt` with locally-assembled prompt. Note: the built-in prompt
variable is named `assembledPrompt` to avoid collision with the unused `args.systemPrompt`
that will be removed from the type in Step 2:

```ts
      // ── Assemble system prompt (Prism layers) ──
      // Main process owns prompt assembly — renderer never passes systemPrompt.
      const promptCtx = await buildPromptContext(args.projectPath);
      const assembledPrompt = promptManager.compose(promptCtx);
      if (assembledPrompt) {
        console.log(`[prism] system prompt assembled: ${assembledPrompt.length} chars`);
      }

      log.info(`Sending prompt: sessionId=${sessionId} tabId=${tabId} promptLen=${args.prompt.length}`);
      let usage = null;
      try {
        const result = await service.sendPrompt(sessionId, args.prompt, {
          model: args.model,
          provider: args.provider,
          systemPrompt: assembledPrompt || undefined,
        });
```

Also add the imports at the top of `ipc/chat.ts`:
```ts
import { promptManager } from "../prompts";
import { buildPromptContext } from "../prompts/context";
```

- [ ] **Step 2: Remove `systemPrompt` from `chat:send` args type**

In the `chat:send` handler's args destructuring (around line 60-76), remove `systemPrompt` from the args type:
```ts
      args: {
        projectPath: string;
        worktreePath?: string;
        prompt: string;
        tabId?: string;
        sessionId?: string | null;
        model?: string;
        provider?: string;
        // systemPrompt?: string;  ← REMOVE THIS LINE
        apiKey?: string;
        baseUrl?: string;
        thoughtLevel?: string;
      },
```

- [ ] **Step 3: Add module IPC to `ipc/settings.ts`**

Add these two handlers after the existing `settings:setAgentProjectConfig` handler:

```ts
  // ── Prompt Modules ──

  ipcMain.handle("settings:getModules", async () => {
    return promptManager.getModules();
  });

  ipcMain.handle(
    "settings:setModule",
    async (_event, args: { key: string; enabled: boolean }) => {
      promptManager.setModuleEnabled(args.key, args.enabled);
      // Persist to electron-store
      if (promptManager.needsModulePersist) {
        updateSettings({
          promptModules: promptManager.dumpModuleStates(),
        } as any);
      }
    },
  );
```

Add the import at the top:
```ts
import { promptManager } from "../prompts";
```

- [ ] **Step 4: Add cache invalidation to `settings:set`**

In the existing `settings:set` handler, add invalidation when `agentSystemPrompt` changes:

Find:
```ts
  ipcMain.handle(
    "settings:set",
    async (_event, patch: Record<string, unknown>) => {
      updateSettings(patch as Parameters<typeof updateSettings>[0]);
    },
  );
```

Replace with:
```ts
  ipcMain.handle(
    "settings:set",
    async (_event, patch: Record<string, unknown>) => {
      updateSettings(patch as Parameters<typeof updateSettings>[0]);
      // Invalidate prompt cache when user custom prompt changes
      if ("agentSystemPrompt" in patch) {
        promptManager.invalidate();
      }
    },
  );
```

- [ ] **Step 5: Update `settings:getDefaultAgentPrompt`**

This IPC still exists for the settings UI's "Preview" feature. Update to use new API:

Find the handler (around line 19-24):
```ts
  ipcMain.handle(
    "settings:getDefaultAgentPrompt",
    async (_event, args?: { projectRoot?: string }) => {
      return getDefaultPrompt(args?.projectRoot);
    },
  );
```

Replace the import and handler:
```ts
import { promptManager } from "../prompts";
import { buildPromptContext } from "../prompts/context";

// ... later:
  ipcMain.handle(
    "settings:getDefaultAgentPrompt",
    async (_event, args?: { projectRoot?: string }) => {
      const ctx = await buildPromptContext(args?.projectRoot);
      return promptManager.compose(ctx);
    },
  );
```

Remove the old import:
```ts
// REMOVE: import { getDefaultPrompt } from "../prompts";
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/ipc/chat.ts src/main/ipc/settings.ts 2>&1 | head -30
```

Expected: no new errors

---

### Task 8: Add PromptModules to AppSettings + Init in Main

**Files:**
- Modify: `src/main/services/settings.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `promptManager` from `./prompts`

- [ ] **Step 1: Add `promptModules` to AppSettings**

In `services/settings.ts`, add to the `AppSettings` interface:

```ts
export interface AppSettings {
  // ... existing fields ...

  /** Custom system prompt for the agent — appended after built-in layers. */
  agentSystemPrompt?: string;

  /** Prompt module toggle states. { "citations": true, "workspace-folders": true, ... }
   *  Missing keys default to the module's built-in default. */
  promptModules?: Record<string, boolean>;
}
```

Also add `promptModules` to the defaults:
```ts
const defaults: AppSettings = {
  // ... existing defaults ...
  agentSystemPrompt: "",
  promptModules: { "workspace-folders": true },
};
```

- [ ] **Step 2: Init PromptManager in `main/index.ts`**

In `app.whenReady()`, after the `getSettings()` call (around line 138), add:

```ts
    // ── Initialize Prompt System ──
    try {
      const { promptManager } = await import("./prompts");
      promptManager.initialize();

      // Restore module toggle states from persisted settings
      if (settings.promptModules) {
        promptManager.loadModuleStates(settings.promptModules);
      }
      console.log("[prism] Prompt system initialized");
    } catch (err: any) {
      console.warn("[prism] Prompt system init failed:", err.message);
    }
```

Insert this block AFTER the existing settings read (`const settings = getSettings()...`) and BEFORE the ACP prewarm section.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit src/main/services/settings.ts src/main/index.ts 2>&1 | head -20
```

Expected: no new errors

---

### Task 9: Clean Renderer — Remove systemPrompt Management

**Files:**
- Modify: `src/renderer/stores/chat-store.ts`
- Modify: `src/renderer/stores/settings-store.ts`

**Interfaces:**
- Produces: `chatSend` no longer passes `systemPrompt` arg
- Removes: `defaultAgentPrompt` from settings-store

- [ ] **Step 1: Remove systemPrompt from chat-store `sendPrompt`**

In `chat-store.ts`, find the `chatSend` call (around line 435-449):

```ts
      await window.electronAPI.chatSend({
        projectPath,
        worktreePath: worktreePath || undefined,
        prompt: userPrompt,
        tabId,
        sessionId,
        apiKey: persistedSettings.aiApiKeys?.[provider] || undefined,
        baseUrl: persistedSettings.aiBaseUrls?.[provider] || undefined,
        model: persistedSettings.aiModel ?? undefined,
        provider,
        systemPrompt: persistedSettings.agentSystemPrompt
          || useSettingsStore.getState().defaultAgentPrompt
          || undefined,
        thoughtLevel: persistedSettings.thoughtLevel || undefined,
      });
```

Remove the `systemPrompt` line entirely:
```ts
      await window.electronAPI.chatSend({
        projectPath,
        worktreePath: worktreePath || undefined,
        prompt: userPrompt,
        tabId,
        sessionId,
        apiKey: persistedSettings.aiApiKeys?.[provider] || undefined,
        baseUrl: persistedSettings.aiBaseUrls?.[provider] || undefined,
        model: persistedSettings.aiModel ?? undefined,
        provider,
        thoughtLevel: persistedSettings.thoughtLevel || undefined,
      });
```

- [ ] **Step 2: Remove `defaultAgentPrompt` from settings-store**

In `settings-store.ts`:

a) Remove the field from `SettingsState` interface:
```ts
  // REMOVE:
  defaultAgentPrompt: string;
  loadDefaultPrompt: (projectRoot?: string) => Promise<void>;
```

b) Remove from initial state:
```ts
  // REMOVE:
  defaultAgentPrompt: "",
```

c) Remove from `loadSettings` function body:
```ts
  // CHANGE:
  const [remote, defaultPrompt] = await Promise.all([
    window.electronAPI.settingsGet(),
    window.electronAPI.settingsGetDefaultAgentPrompt().catch(() => ""),
  ]);
  // TO:
  const remote = await window.electronAPI.settingsGet();
```

```ts
  // REMOVE:
  defaultAgentPrompt: defaultPrompt,
```

d) Remove the `loadDefaultPrompt` method entirely.

e) Remove `loadDefaultPrompt` calls from other files — search for them:
```bash
cd prism-next && grep -rn "loadDefaultPrompt" src/ --include="*.ts" --include="*.tsx"
```

Currently the only caller is in `document-store.ts` line 302:
```ts
useSettingsStore.getState().loadDefaultPrompt(rootPath).catch(() => {});
```
Remove this line.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit \
  src/renderer/stores/chat-store.ts \
  src/renderer/stores/settings-store.ts \
  src/renderer/stores/document-store.ts 2>&1 | head -20
```

Expected: no new errors

---

### Task 10: Update IPC Surface Types (`src/preload/index.ts` + `src/renderer/types/electron.d.ts`)

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`

**Interfaces:**
- Adds: `settingsGetModules`, `settingsSetModule`, `settingsSetPromptModules` in preload
- Updates: `chatSend` args type (remove `systemPrompt`)
- Updates: `ElectronAPI` type in `electron.d.ts`

- [ ] **Step 1: Remove `systemPrompt` from `chatSend` in preload**

In `preload/index.ts`, find (around line 107):
```ts
		chatSend: (args: { projectPath: string; worktreePath?: string; prompt: string; tabId?: string; sessionId?: string | null; apiKey?: string; baseUrl?: string; model?: string; provider?: string; systemPrompt?: string; thoughtLevel?: string }) =>
```

Remove `systemPrompt?: string;`:
```ts
		chatSend: (args: { projectPath: string; worktreePath?: string; prompt: string; tabId?: string; sessionId?: string | null; apiKey?: string; baseUrl?: string; model?: string; provider?: string; thoughtLevel?: string }) =>
```

- [ ] **Step 2: Add module IPC to preload**

After the `settingsGetDefaultAgentPrompt` line (~136):
```ts
		settingsGetDefaultAgentPrompt: (projectRoot?: string) =>
			ipcRenderer.invoke("settings:getDefaultAgentPrompt", { projectRoot }),
```

Add:
```ts
		settingsGetModules: () =>
			ipcRenderer.invoke("settings:getModules"),
		settingsSetModule: (key: string, enabled: boolean) =>
			ipcRenderer.invoke("settings:setModule", { key, enabled }),
```

- [ ] **Step 3: Update `electron.d.ts` types**

In `src/renderer/types/electron.d.ts`:

a) In `chatSend` signature, remove `systemPrompt?: string`:
```ts
  chatSend: (args: { projectPath: string; worktreePath?: string; prompt: string; tabId?: string; sessionId?: string | null; apiKey?: string; baseUrl?: string; model?: string; provider?: string; thoughtLevel?: string }) => Promise<void>;
```

b) Add new settings methods before `settingsGetAgentProjectConfig`:
```ts
  settingsGetModules: () => Promise<Array<{ key: string; label: string; description: string; enabled: boolean; source: string }>>;
  settingsSetModule: (key: string, enabled: boolean) => Promise<void>;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit src/preload/index.ts src/renderer/types/electron.d.ts 2>&1 | head -20
```

Expected: no new errors

---

### Task 11: Create Settings UI Components

**Files:**
- Create: `src/renderer/components/modules/settings/module-settings.tsx`
- Create: `src/renderer/components/modules/settings/prompt-preview.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.settingsGetModules()`, `window.electronAPI.settingsSetModule()`, `window.electronAPI.settingsGetDefaultAgentPrompt()`

- [ ] **Step 1: Write `module-settings.tsx`**

```tsx
// prism-next/src/renderer/components/modules/settings/module-settings.tsx

import { useState, useEffect, useCallback } from "react";

interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export function ModuleSettings() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadModules = useCallback(async () => {
    try {
      const mods = await window.electronAPI.settingsGetModules();
      setModules(mods);
    } catch {
      // settingsGetModules may not be available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModules(); }, [loadModules]);

  const handleToggle = async (key: string, enabled: boolean) => {
    // Optimistic update
    setModules((prev) =>
      prev.map((m) => (m.key === key ? { ...m, enabled } : m)),
    );
    try {
      await window.electronAPI.settingsSetModule(key, enabled);
    } catch {
      // Revert on failure
      setModules((prev) =>
        prev.map((m) => (m.key === key ? { ...m, enabled: !enabled } : m)),
      );
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Prompt Modules</h3>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Prompt Modules</h3>
        <p className="text-xs text-muted-foreground">
          No modules available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Prompt Modules</h3>
      <p className="text-xs text-muted-foreground">
        Global toggle for built-in domain modules. Changes apply to all
        projects.
      </p>

      <div className="space-y-1 mt-2">
        {modules.map((mod) => (
          <label
            key={mod.key}
            className="flex items-start gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input
              type="checkbox"
              checked={mod.enabled}
              onChange={(e) => handleToggle(mod.key, e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium">{mod.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {mod.description}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `prompt-preview.tsx`**

```tsx
// prism-next/src/renderer/components/modules/settings/prompt-preview.tsx

import { useState, useCallback } from "react";
import { useDocumentStore } from "@/stores/document-store";

export function PromptPreview() {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const text =
        await window.electronAPI.settingsGetDefaultAgentPrompt(
          projectRoot ?? undefined,
        );
      setPreview(text);
    } catch {
      setPreview("Failed to load preview.");
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      // Fallback for environments without clipboard API
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => {
          if (!expanded && !preview) loadPreview();
          setExpanded(!expanded);
        }}
        className="text-sm font-medium hover:underline"
      >
        {expanded ? "▾" : "▸"} Assembled Prompt Preview
      </button>

      {expanded && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : (
            <>
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-3 text-[11px] whitespace-pre-wrap">
                {preview || "(empty)"}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                >
                  Copy
                </button>
                <button
                  onClick={loadPreview}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd prism-next && npx tsc --noEmit \
  src/renderer/components/modules/settings/module-settings.tsx \
  src/renderer/components/modules/settings/prompt-preview.tsx 2>&1 | head -20
```

Expected: no new errors

---

### Task 12: Wire Settings UI Components

**Files:**
- Modify: `src/renderer/components/modules/settings/index.ts` (if needed for exports)

**Interfaces:**
- None — pure wiring

The new components (`ModuleSettings`, `PromptPreview`) should be imported and rendered in the existing settings page layout. As this involves layout decisions best made by the developer with the full settings page in context, this task is intentionally lightweight — add the components where they fit in the Agent settings section.

- [ ] **Step 1: Add components to the Agent settings page**

In whatever component renders the "Agent" settings panel (likely a tab/section component), add:

```tsx
import { ModuleSettings } from "./module-settings";
import { PromptPreview } from "./prompt-preview";

// In the Agent section JSX:
<section className="space-y-6">
  {/* Existing system prompt textarea */}
  {/* ... */}

  <ModuleSettings />
  <PromptPreview />
</section>
```

- [ ] **Step 2: Verify the settings page renders without error**

```bash
cd prism-next && pnpm dev
```

Then navigate to Settings → Agent. Confirm:
- Module checkboxes appear
- Workspace Folder Descriptions is checked by default
- Other modules are unchecked
- Prompt Preview expands/collapses
- Copy button works
- No console errors

---

### Task 13: Full Integration Test

- [ ] **Step 1: Compile check the entire project**

```bash
cd prism-next && npx tsc --noEmit 2>&1 | tail -30
```

Expected: no NEW errors introduced by this change. (Pre-existing errors unrelated to the prompt system may exist.)

- [ ] **Step 2: Dev server smoke test**

```bash
cd prism-next && pnpm dev
```

1. Open a project
2. Open a chat tab
3. Type a message and send
4. Check DevTools console for `[prism] system prompt assembled: XXXX chars`
5. Verify the agent responds correctly with LaTeX knowledge
6. Go to Settings → Agent
7. Toggle "Citations & Bibliography" on
8. Send another chat message — agent should now have citation rules
9. Toggle it off — agent should no longer have citation rules
10. Check that workspace folder descriptions appear in the prompt preview

- [ ] **Step 3: Verify AGENTS.md injection**

1. Create a `.prismnext/agent/AGENTS.md` file in a test project with content:
   ```
   Always use `\mathbb{R}` for the real numbers in this project.
   ```
2. Send a chat message asking "What notation should I use for real numbers?"
3. Verify the agent references the AGENTS.md instruction

- [ ] **Step 4: Verify user override appends (does not replace)**

1. In Settings → Agent, enter custom text: "Always sign your responses with -PrismBot"
2. Send a chat message
3. Verify:
   - Agent still follows LaTeX rules (core persona is intact)
   - Agent appends the signature

---

## Implementation Summary

| Task | Files | Depends On |
|------|-------|------------|
| 1. Types | `types.ts` | — |
| 2. Composer | `composer.ts` | Task 1 |
| 3. Modules | `modules/index.ts`, `modules/workspace-folders.ts` | Task 1 |
| 4. Layers | `layers/*.ts` (4 files) | Tasks 1, 3 |
| 5. PromptManager | `index.ts` (rewrite) | Tasks 2, 4 |
| 6. Context | `context.ts` | Task 1 |
| 7. IPC Integration | `ipc/chat.ts`, `ipc/settings.ts` | Tasks 5, 6 |
| 8. AppSettings + Init | `services/settings.ts`, `main/index.ts` | Task 5 |
| 9. Renderer Cleanup | `chat-store.ts`, `settings-store.ts`, `document-store.ts` | — |
| 10. IPC Surface Types | `preload/index.ts`, `electron.d.ts` | Tasks 7, 9 |
| 11. Settings UI | `module-settings.tsx`, `prompt-preview.tsx` | Task 10 |
| 12. Wire UI | settings page component | Task 11 |
| 13. Integration Test | — | All |

**Dependency chain:**
```
1 → 2 → 5 → 7 → 10 → 11 → 12 → 13
1 → 3 → 4 → 5
1 → 6 → 7
5 → 8
9 → 10
```

Tasks 3, 4, 6, 8, 9 can be parallelized.
Tasks 5 blocks everything after it.
Task 13 is the final gate.

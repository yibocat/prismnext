# Agent Settings: Provider / Thought Level — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dynamic provider loading via ACP `config/providers`, wire `thoughtLevel` through ACP `session/set_config_option`, and split chat input into separate Provider and Thought Level dropdowns.

**Architecture:** A static `provider-registry.ts` provides fallback metadata. A dynamic `useProviders` hook calls `config/providers` at startup and merges with the registry. Two new dropdown components in the chat input bar replace the old single gear-menu provider selector. `thoughtLevel` flows from settings-store → chat-store → IPC → ACP `session/set_config_option`.

**Tech Stack:** React 19, TypeScript, Zustand, Radix DropdownMenu, ACP SDK v0.22.1

## Global Constraints

- No automatic git commits
- Provider list: dynamic from ACP, fallback to static registry
- thoughtLevel values: per-provider (Anthropic: low/high/max, OpenAI: minimal/low/medium/high/xhigh, others: low/medium/high/max)
- Chat input: two separate DropdownMenu controls (Provider + Thought Level), not a single gear menu
- Settings page: add thoughtLevel binding, UI deferred
- Remove dead `effortLevel` from main process settings
- All new files in `src/renderer/` unless main-process changes

---

### Task 1: Create provider registry (static metadata + thought levels)

**Files:**
- Create: `src/renderer/lib/provider-registry.ts`

**Interfaces:**
- Produces: `ProviderMeta` type, `PROVIDER_REGISTRY: ProviderMeta[]`, `getProviderMeta(id: string): ProviderMeta | undefined`, `getThoughtLevels(providerId: string): ThoughtLevel[]`

- [ ] **Step 1: Write the file**

```typescript
// src/renderer/lib/provider-registry.ts

export interface ThoughtLevel {
  value: string;   // "low" | "medium" | "high" | "max" | "minimal" | "xhigh"
  label: string;   // display label, e.g. "High (16K tokens)"
}

export interface ProviderMeta {
  id: string;
  name: string;
  defaultModel: string;
  suggestions: string[];
  defaultBaseUrl: string;
  thoughtLevels: ThoughtLevel[];
}

export const PROVIDER_REGISTRY: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-sonnet-4-5-20250929",
    suggestions: [
      "claude-opus-4-8-20250805",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
    ],
    defaultBaseUrl: "https://api.anthropic.com",
    thoughtLevels: [
      { value: "low", label: "Low (8K tokens)" },
      { value: "high", label: "High (16K tokens)" },
      { value: "max", label: "Max (32K tokens)" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-5.2",
    suggestions: ["gpt-5.2", "gpt-5.1", "gpt-5"],
    defaultBaseUrl: "https://api.openai.com",
    thoughtLevels: [
      { value: "minimal", label: "Minimal" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "X-High" },
    ],
  },
  {
    id: "google",
    name: "Google",
    defaultModel: "gemini-3-pro",
    suggestions: ["gemini-3-pro", "gemini-3-flash"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    thoughtLevels: [
      { value: "minimal", label: "Minimal" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: "deepseek-chat",
    suggestions: ["deepseek-chat", "deepseek-reasoner"],
    defaultBaseUrl: "https://api.deepseek.com",
    thoughtLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    defaultModel: "llama-4-maverick",
    suggestions: ["llama-4-maverick", "llama-4-scout", "mixtral-8x7b"],
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    thoughtLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    defaultModel: "mistral-large",
    suggestions: ["mistral-large", "mistral-medium", "mistral-small"],
    defaultBaseUrl: "https://api.mistral.ai/v1",
    thoughtLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "anthropic/claude-sonnet-4-5",
    suggestions: [
      "anthropic/claude-sonnet-4-5",
      "anthropic/claude-opus-4-8",
      "openai/gpt-5.2",
    ],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    thoughtLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  {
    id: "custom",
    name: "Custom",
    defaultModel: "",
    suggestions: [],
    defaultBaseUrl: "",
    thoughtLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "max", label: "Max" },
    ],
  },
];

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getThoughtLevels(providerId: string): ThoughtLevel[] {
  return getProviderMeta(providerId)?.thoughtLevels ?? [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ];
}
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors related to provider-registry.ts.

- [ ] **Step 3: Report ready for next task** (no commit)

---

### Task 2: Add `setConfigOption` to ACP service

**Files:**
- Modify: `src/main/acp/service.ts`

**Interfaces:**
- Produces: `AcpService.setConfigOption(sessionId: string, configId: string, value: string): Promise<void>`

- [ ] **Step 1: Add the method**

Add this method to the `AcpService` class, after `createSession` (around line 326):

```typescript
  /**
   * Set a session configuration option via ACP.
   * Used for thought_level, model, mode, etc.
   */
  async setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    if (!this.conn) throw new Error("AcpService not initialized");
    await this.conn.extMethod("session/set_config_option", {
      sessionId,
      configId,
      value,
    });
  }
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Report ready** (no commit)

---

### Task 3: Wire `thoughtLevel` through IPC

**Files:**
- Modify: `src/main/ipc/chat.ts`

**Interfaces:**
- Consumes: `AcpService.setConfigOption` from Task 2
- Modifies: `chat:send` handler args to accept `thoughtLevel`

- [ ] **Step 1: Accept thoughtLevel in chat:send args**

Add `thoughtLevel?: string` to the args type at line 55:

```typescript
    args: {
      projectPath: string;
      worktreePath?: string;
      prompt: string;
      tabId?: string;
      sessionId?: string | null;
      model?: string;
      provider?: string;
      systemPrompt?: string;
      apiKey?: string;
      baseUrl?: string;
      thoughtLevel?: string;   // NEW
    },
```

- [ ] **Step 2: Call setConfigOption after session creation**

After session creation (after line 106 `bridge.registerSession(sessionId, tabId);`), add:

```typescript
      // Set thought level if specified
      if (args.thoughtLevel) {
        try {
          // Find the thought_level config option from the session
          // The configId varies by agent; try common patterns
          await service.setConfigOption(sessionId, "thought_level", args.thoughtLevel);
        } catch (err: any) {
          log.warn(`setConfigOption thought_level failed: ${err.message}`);
          // Non-fatal — prompt still runs with default thinking
        }
      }
```

- [ ] **Step 3: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Report ready** (no commit)

---

### Task 4: Add `thoughtLevel` to settings store

**Files:**
- Modify: `src/renderer/stores/settings-store.ts`

**Interfaces:**
- Produces: `AppSettings.thoughtLevel?: string`

- [ ] **Step 1: Add to AppSettings interface (line 36, before closing brace)**

```typescript
  /** AI reasoning/thinking depth level (per-provider values) */
  thoughtLevel?: string;
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Report ready** (no commit)

---

### Task 5: Pass `thoughtLevel` in chat-store sendPrompt

**Files:**
- Modify: `src/renderer/stores/chat-store.ts`

**Interfaces:**
- Consumes: `AppSettings.thoughtLevel` from settings-store

- [ ] **Step 1: Add thoughtLevel to chatSend call (around line 445)**

In `sendPrompt`, add to the `chatSend` args object:

```typescript
        thoughtLevel: persistedSettings.thoughtLevel || undefined,
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Report ready** (no commit)

---

### Task 6: Create provider dropdown component

**Files:**
- Create: `src/renderer/components/modules/chat/agent-settings/provider-select.tsx`

**Interfaces:**
- Consumes: `PROVIDER_REGISTRY` from provider-registry.ts (Task 1)
- Produces: `ProviderSelect` component

- [ ] **Step 1: Write the component**

```typescript
// src/renderer/components/modules/chat/agent-settings/provider-select.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/stores/settings-store";
import { PROVIDER_REGISTRY, getProviderMeta } from "@/lib/provider-registry";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

export function ProviderSelect() {
  const aiProvider = useSettingsStore((s) => s.settings.aiProvider) || "anthropic";
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const meta = getProviderMeta(aiProvider);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="AI Provider"
        >
          <span>{meta?.name || aiProvider}</span>
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Provider
        </div>
        {PROVIDER_REGISTRY.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={(e) => e.preventDefault()}
            onClick={() => updateSettings({ aiProvider: p.id })}
          >
            <span className="flex-1 text-[length:var(--font-chat-meta)]">{p.name}</span>
            {aiProvider === p.id && <CheckIcon className="size-3 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Report ready** (no commit)

---

### Task 7: Create thought level dropdown component

**Files:**
- Create: `src/renderer/components/modules/chat/agent-settings/thought-level-select.tsx`

**Interfaces:**
- Consumes: `getThoughtLevels` from provider-registry.ts (Task 1)
- Consumes: `AppSettings.aiProvider`, `AppSettings.thoughtLevel` from settings-store

- [ ] **Step 1: Write the component**

```typescript
// src/renderer/components/modules/chat/agent-settings/thought-level-select.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/stores/settings-store";
import { getThoughtLevels } from "@/lib/provider-registry";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

export function ThoughtLevelSelect() {
  const aiProvider = useSettingsStore((s) => s.settings.aiProvider) || "anthropic";
  const thoughtLevel = useSettingsStore((s) => s.settings.thoughtLevel);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const levels = getThoughtLevels(aiProvider);
  const current = levels.find((l) => l.value === thoughtLevel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Reasoning depth"
        >
          <span>{current?.label || "Default"}</span>
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Reasoning Depth
        </div>
        {/* "Default" option — no explicit level set */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => updateSettings({ thoughtLevel: undefined })}
        >
          <span className="flex-1 text-[length:var(--font-chat-meta)]">Default</span>
          {!thoughtLevel && <CheckIcon className="size-3 shrink-0" />}
        </DropdownMenuItem>
        {levels.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onSelect={(e) => e.preventDefault()}
            onClick={() => updateSettings({ thoughtLevel: l.value })}
          >
            <span className="flex-1 text-[length:var(--font-chat-meta)]">{l.label}</span>
            {thoughtLevel === l.value && <CheckIcon className="size-3 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Report ready** (no commit)

---

### Task 8: Rewrite AgentSettingsBar with two dropdowns only

**Files:**
- Modify: `src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx`

**Interfaces:**
- Consumes: `ProviderSelect` (Task 6), `ThoughtLevelSelect` (Task 7)

- [ ] **Step 1: Replace the file**

```typescript
// src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx
import { ProviderSelect } from "./provider-select";
import { ThoughtLevelSelect } from "./thought-level-select";

export function AgentSettingsBar() {
  return (
    <div className="flex items-center gap-0.5">
      <ProviderSelect />
      <ThoughtLevelSelect />
    </div>
  );
}
```

No gear button — full settings is accessed from the left sidebar. The old `OpenCodeSettingsContent` / `OpenCodeSettingsLabel` imports are removed.

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Report ready** (no commit)

---

### Task 9: Update external-settings.tsx — add thoughtLevel binding

**Files:**
- Modify: `src/renderer/components/modules/settings/external-settings.tsx`

The spec says "Settings page UI deferred". Add a basic thoughtLevel binding — a simple dropdown or placeholder. This ensures the field persists without building full UI.

- [ ] **Step 1: Read the current file to find where aiProvider/aiModel settings are rendered**

Read `external-settings.tsx` around the AI settings section.

- [ ] **Step 2: Add a minimal thoughtLevel section**

After the model selection UI, add:

```tsx
{/* Reasoning Depth */}
<div className="space-y-2">
  <label className="text-sm font-medium">Reasoning Depth</label>
  <select
    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
    value={settings.thoughtLevel || ""}
    onChange={(e) =>
      updateSettings({
        thoughtLevel: e.target.value || undefined,
      })
    }
  >
    <option value="">Provider default</option>
    <option value="low">Low</option>
    <option value="medium">Medium</option>
    <option value="high">High</option>
    <option value="max">Max</option>
    <option value="minimal">Minimal</option>
    <option value="xhigh">X-High</option>
  </select>
  <p className="text-xs text-muted-foreground">
    Controls reasoning depth. Available levels depend on your AI provider.
  </p>
</div>
```

- [ ] **Step 3: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Report ready** (no commit)

---

### Task 10: Remove dead `effortLevel` from main process

**Files:**
- Modify: `src/main/services/settings.ts`

- [ ] **Step 1: Remove effortLevel from AppSettings type and defaults**

Remove `effortLevel: "low" | "medium" | "high";` from the interface (line 6).
Remove `effortLevel: "low",` from defaults (line 20).

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Report ready** (no commit)

---

### Task 11: Final verification — build and type-check

- [ ] **Step 1: TypeScript check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Production build**

```bash
cd prism-next && pnpm build
```

Expected: builds successfully.

- [ ] **Step 3: Verify no remaining references to old effortLevel**

```bash
grep -r "effortLevel" prism-next/src/ --include="*.ts" --include="*.tsx" -l
```

Expected: no output (all removed).

# Agent Settings Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple agent-specific settings into independent components with a shared container and generic store, replacing the monolithic `agent-settings-bar.tsx`.

**Architecture:** New `agent-settings-store.ts` (flat KV map) replaces Claude-specific fields in `claude-chat-store`. New `agent-settings/` directory with container (`agent-settings-bar.tsx`) and per-agent components (`claude-settings.tsx`, etc.). Container reads `selectedAgent` and dispatches to the correct component via a registry map.

**Tech Stack:** Zustand, React 19, TypeScript, Tailwind 4, shadcn/ui DropdownMenu

---

### Task 1: Create `agent-settings-store.ts`

**Files:**
- Create: `src/renderer/stores/agent-settings-store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from "zustand";

interface AgentSettingsState {
  settings: Record<string, string | null>;
  setSetting: (key: string, value: string | null) => void;
  getSetting: (key: string) => string | null;
}

export const useAgentSettingsStore = create<AgentSettingsState>()((set, get) => ({
  settings: {},

  setSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),

  getSetting: (key) => get().settings[key] ?? null,
}));
```

- [ ] **Step 2: Build and verify no errors**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && pnpm build
```

Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/agent-settings-store.ts
git commit -m "feat: add agent-settings-store with generic KV map

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Remove agent-specific fields from `claude-chat-store.ts`

**Files:**
- Modify: `src/renderer/stores/claude-chat-store.ts`

- [ ] **Step 1: Remove type fields from interface**

Remove these lines from the `ClaudeChatState` interface:
```ts
  selectedModel: "sonnet" | "opus" | "haiku" | null;
  effortLevel: "low" | "medium" | "high";
  agentMode: "edit-before-ask" | "auto-edit" | "plan";
  setSelectedModel: (model: "sonnet" | "opus" | "haiku" | null) => void;
  setEffortLevel: (level: "low" | "medium" | "high") => void;
  setAgentMode: (mode: "edit-before-ask" | "auto-edit" | "plan") => void;
```

- [ ] **Step 2: Remove initial state defaults**

Remove these lines from the initial state object:
```ts
  selectedModel: null,
  effortLevel: "low",
  agentMode: "edit-before-ask",
```

- [ ] **Step 3: Remove action implementations**

Remove these lines from the store's `create` callback:
```ts
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setEffortLevel: (effortLevel) => set({ effortLevel }),
  setAgentMode: (agentMode) => set({ agentMode }),
```

- [ ] **Step 4: Update `sendPrompt` to read from agent-settings-store**

Add the import at top:
```ts
import { useAgentSettingsStore } from "./agent-settings-store";
```

Change the `agentSend` call from:
```ts
await window.electronAPI.agentSend(
  projectPath, userPrompt, tabId, agentId, sessionId ?? undefined,
  get().selectedModel, get().agentMode, get().effortLevel
);
```

To:
```ts
const agentSettings = useAgentSettingsStore.getState();
await window.electronAPI.agentSend(
  projectPath, userPrompt, tabId, agentId, sessionId ?? undefined,
  agentSettings.getSetting("model"), agentSettings.getSetting("agentMode"), agentSettings.getSetting("effort")
);
```

- [ ] **Step 5: Build and verify**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && pnpm build
```

Expected: build fails (other files still reference removed fields)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stores/claude-chat-store.ts
git commit -m "refactor: remove agent-specific fields from claude-chat-store

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Create agent settings directory with per-agent components

**Files:**
- Create: `src/renderer/components/modules/chat/agent-settings/claude-settings.tsx`
- Create: `src/renderer/components/modules/chat/agent-settings/gemini-settings.tsx`
- Create: `src/renderer/components/modules/chat/agent-settings/opencode-settings.tsx`
- Create: `src/renderer/components/modules/chat/agent-settings/qoder-settings.tsx`

- [ ] **Step 1: Create `claude-settings.tsx`**

```tsx
import { useCallback } from "react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAgentSettingsStore } from "@/stores/agent-settings-store";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

interface SettingOption {
  id: string | null;
  name: string;
  desc?: string;
}

const MODEL_OPTIONS: SettingOption[] = [
  { id: null, name: "Default", desc: "Use system Claude Code setting" },
  { id: "sonnet", name: "Sonnet", desc: "Fast, efficient for most tasks" },
  { id: "opus", name: "Opus", desc: "Most capable, complex reasoning" },
  { id: "haiku", name: "Haiku", desc: "Fastest, simple tasks" },
];

const MODE_OPTIONS: SettingOption[] = [
  { id: "edit-before-ask", name: "Edit before ask" },
  { id: "auto-edit", name: "Auto edit" },
  { id: "plan", name: "Plan mode" },
];

const EFFORT_LEVELS = ["low", "medium", "high"] as const;

function SelectSection({
  label,
  options,
  settingKey,
}: {
  label: string;
  options: SettingOption[];
  settingKey: string;
}) {
  const rawValue = useAgentSettingsStore((s) => s.settings[settingKey]);
  const setSetting = useAgentSettingsStore((s) => s.setSetting);

  return (
    <div>
      <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
        {label}
      </div>
      {options.map((opt) => (
        <DropdownMenuItem
          key={opt.id ?? "default"}
          onSelect={(e) => e.preventDefault()}
          onClick={() => setSetting(settingKey, opt.id)}
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[length:var(--font-chat-meta)]">{opt.name}</div>
            {opt.desc && (
              <div className="truncate text-muted-foreground text-[length:var(--font-chat-meta)]">{opt.desc}</div>
            )}
          </div>
          {rawValue === opt.id && <CheckIcon className="size-3 shrink-0" />}
        </DropdownMenuItem>
      ))}
    </div>
  );
}

function EffortSection() {
  const effortLevel = useAgentSettingsStore((s) => s.settings["effort"]) ?? "medium";
  const setSetting = useAgentSettingsStore((s) => s.setSetting);

  return (
    <div className="px-2 py-1.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">Effort</span>
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
          {effortLevel === "low" ? "Low" : effortLevel === "medium" ? "Medium" : "High"}
        </span>
      </div>
      <div className="flex gap-1">
        {EFFORT_LEVELS.map((level) => (
          <button
            key={level}
            className={cn(
              "flex-1 rounded-md py-1 text-center font-medium text-[length:var(--font-chat-meta)] transition-colors",
              effortLevel === level
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            onClick={(e) => { e.stopPropagation(); setSetting("effort", level); }}
          >
            {level === "low" ? "L" : level === "medium" ? "M" : "H"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ClaudeSettingsContent() {
  return (
    <>
      <SelectSection label="Model" options={MODEL_OPTIONS} settingKey="model" />
      <DropdownMenuSeparator />
      <SelectSection label="Mode" options={MODE_OPTIONS} settingKey="agentMode" />
      <DropdownMenuSeparator />
      <EffortSection />
    </>
  );
}

export function ClaudeSettingsLabel() {
  const settings = useAgentSettingsStore((s) => s.settings);
  const model = settings["model"];
  const mode = settings["agentMode"];
  const effort = settings["effort"] ?? "medium";

  const modelLabel =
    model === "sonnet" ? "Sonnet" : model === "opus" ? "Opus" : model === "haiku" ? "Haiku" : "Default";
  const modeLabel =
    mode === "auto-edit" ? "Auto edit" : mode === "plan" ? "Plan mode" : "Edit before ask";
  const effortLabel = effort === "low" ? "L" : effort === "high" ? "H" : "M";

  return (
    <span>
      {modelLabel}
      <span className="text-muted-foreground/40 mx-0.5">·</span>
      {modeLabel}
      <span className="text-muted-foreground/40 mx-0.5">·</span>
      {effortLabel}
    </span>
  );
}
```

- [ ] **Step 2: Create stub `gemini-settings.tsx`**

```tsx
export function GeminiSettingsContent() {
  return (
    <div className="px-3 py-4 text-center text-muted-foreground text-[length:var(--font-chat-meta)]">
      Configure Gemini settings when agent is enabled.
    </div>
  );
}

export function GeminiSettingsLabel() {
  return <span>Gemini CLI</span>;
}
```

- [ ] **Step 3: Create stub `opencode-settings.tsx`**

```tsx
export function OpenCodeSettingsContent() {
  return (
    <div className="px-3 py-4 text-center text-muted-foreground text-[length:var(--font-chat-meta)]">
      Configure OpenCode settings when agent is enabled.
    </div>
  );
}

export function OpenCodeSettingsLabel() {
  return <span>OpenCode</span>;
}
```

- [ ] **Step 4: Create stub `qoder-settings.tsx`**

```tsx
export function QoderSettingsContent() {
  return (
    <div className="px-3 py-4 text-center text-muted-foreground text-[length:var(--font-chat-meta)]">
      Configure Qoder settings when agent is enabled.
    </div>
  );
}

export function QoderSettingsLabel() {
  return <span>Qoder CLI</span>;
}
```

- [ ] **Step 5: Build and verify**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && pnpm build
```

Expected: build fails (ChatComposer still references old AgentSettingsBar)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/modules/chat/agent-settings/
git commit -m "feat: add per-agent settings components with Claude implementation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Create container `agent-settings-bar.tsx`

**Files:**
- Create: `src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx`

- [ ] **Step 1: Write the container**

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { ChevronDownIcon } from "lucide-react";
import { ClaudeSettingsContent, ClaudeSettingsLabel } from "./claude-settings";
import { GeminiSettingsContent, GeminiSettingsLabel } from "./gemini-settings";
import { OpenCodeSettingsContent, OpenCodeSettingsLabel } from "./opencode-settings";
import { QoderSettingsContent, QoderSettingsLabel } from "./qoder-settings";

interface AgentSettingsComponent {
  Content: React.ComponentType;
  Label: React.ComponentType;
}

const REGISTRY: Record<string, AgentSettingsComponent> = {
  claude: { Content: ClaudeSettingsContent, Label: ClaudeSettingsLabel },
  gemini: { Content: GeminiSettingsContent, Label: GeminiSettingsLabel },
  opencode: { Content: OpenCodeSettingsContent, Label: OpenCodeSettingsLabel },
  qoder: { Content: QoderSettingsContent, Label: QoderSettingsLabel },
};

export function AgentSettingsBar() {
  const selectedAgent = useClaudeChatStore((s) => s.selectedAgent);
  const entry = REGISTRY[selectedAgent] || REGISTRY.claude;
  const { Content, Label } = entry;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-muted-foreground text-[length:var(--font-chat-meta)] transition-colors hover:bg-muted hover:text-foreground"
        >
          <Label />
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <Content />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && pnpm build
```

Expected: build fails (ChatComposer still imports old path)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx
git commit -m "feat: add AgentSettingsBar container with agent registry

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Update ChatComposer to use new AgentSettingsBar

**Files:**
- Modify: `src/renderer/components/modules/chat/chat-composer.tsx`

- [ ] **Step 1: Update import path**

Change:
```ts
import { AgentSettingsBar } from "./agent-settings-bar";
```
To:
```ts
import { AgentSettingsBar } from "./agent-settings/agent-settings-bar";
```

- [ ] **Step 2: Remove unused store subscriptions from ChatComposer**

Remove these lines (already orphaned after Task 2):
```ts
// These should already be gone from Task 2. Verify they are not present.
// const selectedModel = useClaudeChatStore((s) => s.selectedModel);
// const setSelectedModel = useClaudeChatStore((s) => s.setSelectedModel);
// const agentMode = useClaudeChatStore((s) => s.agentMode);
// const setAgentMode = useClaudeChatStore((s) => s.setAgentMode);
// const effortLevel = useClaudeChatStore((s) => s.effortLevel);
// const setEffortLevel = useClaudeChatStore((s) => s.setEffortLevel);
// const modelLabel = ...
// const AGENT_MODES = ...
// const currentMode = ...
```

Verify by checking the file: these were already removed in previous edits. If any remain, delete them.

- [ ] **Step 3: Build and verify**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && pnpm build
```

Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/modules/chat/chat-composer.tsx
git commit -m "refactor: switch ChatComposer to new AgentSettingsBar

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Lock agent selector when conversation has messages

**Files:**
- Modify: `src/renderer/components/layout/left-main-area.tsx`

- [ ] **Step 1: Add disabled state to agent selector**

Find the agent selector `DropdownMenu` in the top toolbar and add `disabled` to the trigger button:

```tsx
<DropdownMenuTrigger asChild>
  <button
    type="button"
    disabled={!isEmpty}
    className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <span>{currentAgent?.name || "CLI"}</span>
    <ChevronDownIcon className="size-3" />
  </button>
</DropdownMenuTrigger>
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && pnpm build
```

Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/left-main-area.tsx
git commit -m "feat: disable agent selector when conversation has messages

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Initialize Claude defaults and delete old file

**Files:**
- Modify: `src/renderer/stores/agent-settings-store.ts`
- Delete: `src/renderer/components/modules/chat/agent-settings-bar.tsx`

- [ ] **Step 1: Add defaults initialization**

Update `agent-settings-store.ts` to initialize Claude defaults:

```ts
import { create } from "zustand";

interface AgentSettingsState {
  settings: Record<string, string | null>;
  setSetting: (key: string, value: string | null) => void;
  getSetting: (key: string) => string | null;
}

const DEFAULTS: Record<string, string | null> = {
  model: null,
  agentMode: "edit-before-ask",
  effort: "medium",
};

export const useAgentSettingsStore = create<AgentSettingsState>()((set, get) => ({
  settings: { ...DEFAULTS },

  setSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),

  getSetting: (key) => get().settings[key] ?? null,
}));
```

- [ ] **Step 2: Delete old file**

```bash
rm /Users/yibow/MyPro/ResearchPrism/prism-next/src/renderer/components/modules/chat/agent-settings-bar.tsx
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && pnpm build
```

Expected: build succeeds

- [ ] **Step 4: Final commit**

```bash
git add src/renderer/stores/agent-settings-store.ts
git rm src/renderer/components/modules/chat/agent-settings-bar.tsx
git commit -m "chore: init Claude defaults, remove old agent-settings-bar

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Post-Implementation Verification

- [ ] Open a project, verify the agent settings dropdown shows "Default · Edit before ask · M"
- [ ] Change model to Sonnet → verify label updates to "Sonnet · Edit before ask · M"
- [ ] Change mode to Auto edit → verify label and dropdown checkmark
- [ ] Send a message → verify agent selector in top toolbar is disabled
- [ ] Start a new session → verify agent selector is enabled again
- [ ] Verify the old `agent-settings-bar.tsx` is deleted

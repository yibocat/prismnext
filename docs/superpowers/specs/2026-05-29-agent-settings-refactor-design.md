# Agent Settings Refactor — Design Spec

**Date:** 2026-05-29
**Status:** Approved

## Goal

Decouple agent-specific settings (Model, Mode, Effort, etc.) from the chat store and from a single monolithic component. Each ACP agent gets its own settings component. A shared container handles dispatch and UI shell.

## Motivation

- Current `agent-settings-bar.tsx` hardcodes Claude-specific logic (model/mode/effort key mapping via if/else)
- `claude-chat-store.ts` holds Claude-specific fields (`selectedModel`, `agentMode`, `effortLevel`) that don't belong in a chat infrastructure store
- Adding a new agent (Gemini, OpenCode, Qoder) requires touching core files
- Each agent has different configurable parameters — the UI should reflect this naturally

## Design

### 1. New Store: `agent-settings-store.ts`

```ts
// stores/agent-settings-store.ts
interface AgentSettingsState {
  settings: Record<string, string | null>;
  setSetting: (key: string, value: string | null) => void;
  getSetting: (key: string) => string | null;
}
```

All agent parameters go into a flat key-value map. Claude uses keys `model`, `agentMode`, `effort`. Gemini uses `model`, `temperature`, `style`. No agent-specific fields in the store type.

### 2. Remove from `claude-chat-store.ts`

Remove: `selectedModel`, `setSelectedModel`, `effortLevel`, `setEffortLevel`, `agentMode`, `setAgentMode`.

Update `sendPrompt()` to read from `agent-settings-store.getSetting()` instead.

### 3. Container: `agent-settings/agent-settings-bar.tsx`

```tsx
// Responsibilities:
// - Read selectedAgent from claude-chat-store
// - Look up agent component from registry
// - Render unified DropdownMenu shell (trigger button + content)
// - Trigger label: each agent component exports a Label component

const AGENT_SETTINGS_COMPONENTS: Record<string, React.ComponentType> = {
  claude: ClaudeSettings,
  gemini: GeminiSettings,
  opencode: OpenCodeSettings,
  qoder: QoderSettings,
};
```

### 4. Agent Components: `agent-settings/claude-settings.tsx` etc.

Each agent component exports:
- **`Content`** — renders the dropdown content (Model section, Mode section, Effort section, etc.)
- **`Label`** — renders the trigger button text (e.g., "Sonnet · Edit before ask · M")

Each component manages its own store reads/writes via `agent-settings-store`.

### 5. File Structure

```
prism-next/src/renderer/
├── stores/
│   ├── claude-chat-store.ts              ← remove agent-specific fields
│   └── agent-settings-store.ts           ← NEW
├── lib/
│   └── agent-config.ts                   ← schema (unchanged)
├── components/modules/chat/
│   ├── agent-settings/
│   │   ├── agent-settings-bar.tsx        ← container
│   │   ├── claude-settings.tsx           ← Claude Content + Label
│   │   ├── gemini-settings.tsx           ← Gemini Content + Label
│   │   ├── opencode-settings.tsx         ← OpenCode Content + Label
│   │   └── qoder-settings.tsx            ← Qoder Content + Label
│   ├── chat-composer.tsx                 ← import AgentSettingsBar
│   ├── chat-messages.tsx
│   └── agent-settings-bar.tsx            ← DELETE (old file)
└── main/agents/
    └── configs.ts                        ← agent configs with settings schema
```

### 6. Agent Switching Constraint

- Agent selector in top toolbar: **enabled only when `messages.length === 0`** (empty conversation)
- Once a conversation has messages, agent selector is disabled
- Agent settings (Model, Mode, Effort) remain adjustable at any time
- Switching agent = new ACP session, previous context is lost

### 7. Migration Path

1. Create `agent-settings-store.ts`
2. Create `agent-settings/` directory with container + 4 agent components (only Claude has real logic; others are placeholders)
3. Update `ChatComposer` to use new `AgentSettingsBar`
4. Update `LeftMainArea` agent selector to disable when has messages
5. Update `sendPrompt` in `claude-chat-store` to read from agent-settings-store
6. Remove deprecated fields from `claude-chat-store`
7. Delete old `agent-settings-bar.tsx`

### 8. ACP Parameter Pass-Through

Already in place from previous work: `AgentManager.sendPrompt` accepts `agentMode` and `effortLevel`, stores them on `TabSession.settings`. Future: apply these when spawning/resuming ACP sessions (env vars, CLI args).

## Risks

- **Store migration**: existing code that reads `selectedModel` from `claude-chat-store` must be updated to use `agent-settings-store`
- **Placeholder agents**: Gemini/OpenCode/Qoder components will be stubs until those agents are activated

## Non-Goals

- Implementing actual functionality for Gemini/OpenCode/Qoder agents
- ACP protocol changes for agent-specific parameters
- Changing the visual design of individual settings controls (Model dropdown, Effort buttons remain as-is)

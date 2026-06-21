# Agent Settings: Provider / Model / Thought Level

**Date:** 2026-06-19
**Status:** Draft
**Project:** prism-next

---

## Motivation

The current agent settings UX has three problems:

1. **Provider/model/effort are tangled** — the chat input shows a single gear dropdown, not separate controls. Users can't quickly switch providers or thought levels without opening nested panels.

2. **Effort level is dead code** — `effortLevel: "low" | "medium" | "high"` is stored but never consumed. No UI to change it, no ACP parameter wired to it.

3. **Provider list is hardcoded** — 8 providers with free-text model input. OpenCode's ACP `config/providers` endpoint can dynamically return available providers.

## Goal

1. **Dynamic provider list** — call ACP `config/providers` for available providers, merge with local fallback registry. Keep `Custom` option for user-defined providers.

2. **Thought level via ACP** — use ACP `session/set_config_option` with category `"thought_level"` to control reasoning depth. Replace dead `effortLevel` code.

3. **Separate controls in chat input** — Provider dropdown and Thought Level dropdown as distinct controls, not buried in a settings panel.

4. **Settings page groundwork** — add `thoughtLevel` to settings store, expose in Agent Settings page (UI refinement deferred).

## Non-Goals

- Redesigning the full Settings → AI page UI
- Dynamic model fetching (still free-text with suggestions)
- MCP server configuration
- Removing the gear/settings button from chat input

---

## Architecture

### Data Flow

```
App Start
  └─→ ACP config/providers (dynamic)
        │
        ├─→ provider-registry.ts (static fallback)
        │
        └─→ UI dropdowns populated
              │
Chat Send:
  renderer: ProviderSelect + ThoughtLevelSelect
    → settings-store (aiProvider, aiModel, thoughtLevel)
    → chat-store.sendPrompt()
    → IPC chat:send { provider, model, thoughtLevel }
      → main: session/new { model }
      → main: session/set_config_option { thought_level }
      → main: session/prompt { prompt, model }
```

### New Settings Store Fields

```typescript
// settings-store.ts additions:
thoughtLevel?: string  // "low" | "medium" | "high" | "max" | undefined (provider default)
```

### New IPC Parameter

```typescript
// chat:send args addition:
thoughtLevel?: string
```

### New ACP Calls

```
session/set_config_option { sessionId, configId, value }
  - configId comes from NewSessionResponse.configOptions
  - Maps thoughtLevel to the agent's thought_level option
```

### Provider Registry (fallback when ACP unavailable)

```typescript
// lib/provider-registry.ts
interface ProviderMeta {
  id: string;
  name: string;
  defaultModel: string;
  suggestions: string[];
  defaultBaseUrl: string;
  thoughtLevels: { value: string; label: string; }[];
}
```

Thought levels per provider:

| Provider | Levels | Notes |
|----------|--------|-------|
| Anthropic | low(8K), high(16K), max(32K) | token budget |
| OpenAI | minimal, low, medium, high, xhigh | reasoning effort |
| Google | minimal, low, medium, high | thinking level (model-dependent) |
| DeepSeek | low, medium, high | generic |
| Groq | low, medium, high | generic |
| Mistral | low, medium, high | generic |
| OpenRouter | low, medium, high, max | passthrough |
| Custom | low, medium, high, max | generic |

---

## Component Design

### Chat Input Layout

```
┌──────────────────────────────────────────────────────┐
│ [@ context]  [Provider ▾]  [Thought ▾]  [⚙️ Settings] [Send] │
└──────────────────────────────────────────────────────┘
```

### File Changes

| File | Change |
|------|--------|
| `lib/provider-registry.ts` | **New** — static provider metadata, thought level maps |
| `lib/provider-loader.ts` | **New** — dynamic loader: ACP config/providers + registry fallback |
| `hooks/use-providers.ts` | **New** — React hook for provider list |
| `chat/agent-settings/agent-settings-bar.tsx` | **Rewrite** — two dropdowns + gear button |
| `chat/agent-settings/provider-select.tsx` | **New** — provider dropdown with dynamic list |
| `chat/agent-settings/thought-level-select.tsx` | **New** — thought level dropdown, provider-aware |
| `chat/agent-settings/opencode-settings.tsx` | Remove from chat bar, keep in Settings page |
| `chat/chat-composer.tsx` | Update AgentSettingsBar usage |
| `stores/settings-store.ts` | Add `thoughtLevel` |
| `stores/chat-store.ts` | Pass `thoughtLevel` to IPC |
| `main/ipc/chat.ts` | Accept `thoughtLevel`, call new ACP methods |
| `main/acp/service.ts` | Add `setConfigOption`, `getProviders` methods |
| `components/modules/settings/external-settings.tsx` | Add thoughtLevel binding (placeholder) |

### Implementation Order

1. `lib/provider-registry.ts` — static metadata (zero deps)
2. `main/acp/service.ts` → add `getProviders()`, `setConfigOption()`
3. `main/ipc/chat.ts` → wire `thoughtLevel`, provider loading
4. `stores/settings-store.ts` → add `thoughtLevel`
5. `lib/provider-loader.ts` + `hooks/use-providers.ts` → dynamic loading
6. `chat/agent-settings/provider-select.tsx` → provider dropdown
7. `chat/agent-settings/thought-level-select.tsx` → thought level dropdown
8. `chat/agent-settings/agent-settings-bar.tsx` → rewrite with two dropdowns
9. `chat/chat-composer.tsx` → update layout
10. `stores/chat-store.ts` → pass `thoughtLevel` to sendPrompt
11. `components/modules/settings/external-settings.tsx` → thoughtLevel binding
12. `pnpm build` verification

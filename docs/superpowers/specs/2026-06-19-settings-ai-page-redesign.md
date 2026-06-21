# Settings AI Page Redesign

**Date:** 2026-06-19
**Status:** Approved
**Project:** prism-next

---

## Motivation

The current Settings → "AI & APIs" page has UX problems:
1. All 8 providers' API key fields are shown at once — too much clutter
2. Model selection is free-text input — users must know exact model IDs
3. No connection test — users don't know if their API key works
4. Base URL field is unnecessary noise
5. Provider buttons + model input + all API keys crammed into one scroll view

## Goal

Redesign as an expandable list: each provider is a collapsible item. Expanding reveals API Key (with test button), model list (with selection), and reasoning depth. Only the currently selected provider auto-expands; others stay collapsed.

## Design

### List View (Collapsed)

```
┌─ Anthropic ──────────────────────────── ✅ ──────────┐
┌─ OpenAI ─────────────────────────────── ▾ ───────────┐
┌─ Google ─────────────────────────────── ▾ ───────────┐
┌─ DeepSeek ───────────────────────────── ▾ ───────────┐
┌─ Groq ───────────────────────────────── ▾ ───────────┐
┌─ Mistral ────────────────────────────── ▾ ───────────┐
┌─ OpenRouter ─────────────────────────── ▾ ───────────┐
┌─ Custom ─────────────────────────────── ▾ ───────────┐
```

- ✅ = API key configured & verified
- ▾ = collapsed, click to expand
- Currently active provider highlighted with border/background

### List View (Expanded)

```
┌─ Anthropic ──────────────────────────── ✅ ──────────┐
│                                                       │
│  API Key                                              │
│  ┌──────────────────────────────────┬────┬────┐      │
│  │ sk-ant-••••••••••               │ 👁 │ 🟢 │      │
│  └──────────────────────────────────┴────┴────┘      │
│                                                       │
│  Models                                               │
│  ┌─ claude-sonnet-4-5-20250929 ───────── ✅ ────────┐ │
│  └───────────────────────────────────────────────────┘ │
│  ┌─ claude-opus-4-8 ────────────────────────────────┐ │
│  └───────────────────────────────────────────────────┘ │
│  ┌─ + Add model... ─────────────────────────────────┐ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
│  Reasoning Depth                                       │
│  High (16K tokens) ▾                                   │
└───────────────────────────────────────────────────────┘
```

Row details:
- **API Key**: password input with 👁 visibility toggle + 🟢/🔴 test button
- **Models**: list of model rows. Dynamic from ACP after key verification (config/providers), fallback to static registry suggestions. Current model shows ✅. Click a row to select that model.
- **+ Add model**: inline input, user types model ID, Enter to add to list and select it
- **Reasoning Depth**: dropdown with provider-specific levels

### Test Button Flow

```
[Test] → spinning → 🟢 (verified) / 🔴 (failed)
                        ↑ sets ✅ on provider item
```

Test calls a new IPC `chat:testConnection` → main process sends `config/setAuth` + `config/providers` ACP calls → returns `{ success: boolean }`

### Model Selection

- Clicking a model row sets `aiModel` in settings
- The selected model shows ✅
- Model list sources: dynamic ACP providers endpoint after key verification, merged with static registry suggestions, plus user-added custom models
- User-added models stored per-provider in settings (`aiCustomModels?: Record<string, string[]>`)

### Data Flow

```
Settings AI Page
  ├─ Select provider → updateSettings({ aiProvider })
  ├─ Enter API Key → updateSettings({ aiApiKeys: { ... } })
  ├─ Test Connection → IPC chat:testConnection → config/setAuth + config/providers
  │   └─ sets verified flag per provider
  ├─ Select Model → updateSettings({ aiModel })
  ├─ Add Custom Model → updateSettings({ aiCustomModels: { ... } })
  └─ Reasoning Depth → updateSettings({ thoughtLevel })
        │
        ▼
  Chat Input Dropdowns
    ├─ ProviderSelect ← aiProvider
    ├─ (ModelSelect — future, not in this spec)
    └─ ThoughtLevelSelect ← thoughtLevel + aiProvider
```

---

## Files

| File | Change |
|------|--------|
| `components/modules/settings/external-settings.tsx` | **Rewrite** — expandable provider list |
| `components/modules/settings/provider-item.tsx` | **New** — single expandable provider row |
| `stores/settings-store.ts` | Add `aiCustomModels` field |
| `main/ipc/chat.ts` | Add `chat:testConnection` IPC handler |
| `main/acp/service.ts` | Add `testConnection` method |
| `lib/provider-registry.ts` | Add model fallback list per provider |

### Non-Goals

- Model dropdown in chat input (deferred)
- Dynamic model fetching from provider APIs (uses ACP only)
- Removing Zotero section (stays as-is below the AI section)
- Changing `agent-project-settings.tsx` or `agent-app-settings.tsx`

---

## Implementation Order

1. Add `aiCustomModels` to settings-store
2. Add `testConnection` to ACP service
3. Add `chat:testConnection` IPC handler
4. Create `provider-item.tsx` component
5. Rewrite `external-settings.tsx` with expandable list
6. Remove old `AI_PROVIDERS` static list, use `PROVIDER_REGISTRY` from provider-registry.ts
7. Type-check + build verification

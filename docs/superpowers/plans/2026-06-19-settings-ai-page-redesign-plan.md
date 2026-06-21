# Settings AI Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Settings → AI page as an expandable provider list with API key + test button, dynamic model selection, and reasoning depth per provider.

**Architecture:** Each provider is a collapsible `ProviderItem` component. Expanded state shows API Key input with visibility toggle + test button, model list (dynamic ACP + static registry + user-custom), and reasoning depth dropdown. Test button calls a new IPC `chat:testConnection` which uses ACP `config/setAuth` + `config/providers` to validate credentials.

**Tech Stack:** React 19, TypeScript, Zustand, shadcn/ui (Input, Button), lucide-react

## Global Constraints

- No automatic git commits
- Provider list from `PROVIDER_REGISTRY` in `lib/provider-registry.ts` (reuse, don't duplicate)
- Model list: dynamic from ACP after test, fallback to registry suggestions, plus user-custom via `aiCustomModels`
- Remove Base URL field from settings page
- Keep Zotero section unchanged
- Chat input ProviderSelect/ThoughtLevelSelect already use provider-registry — keep in sync

---

### Task 1: Add `aiCustomModels` and `aiVerifiedProviders` to settings store

**Files:**
- Modify: `src/renderer/stores/settings-store.ts`

**Interfaces:**
- Produces: `AppSettings.aiCustomModels?: Record<string, string[]>`, `AppSettings.aiVerifiedProviders?: string[]`

- [ ] **Step 1: Add to AppSettings interface**

Read the file, then add two fields to `AppSettings`:

```typescript
  /** User-added custom model IDs per provider */
  aiCustomModels?: Record<string, string[]>;
  /** Providers whose API keys have been verified */
  aiVerifiedProviders?: string[];
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

---

### Task 2: Add `testConnection` to ACP service

**Files:**
- Modify: `src/main/acp/service.ts`

**Interfaces:**
- Produces: `AcpService.testConnection(provider: string, apiKey: string, baseUrl?: string): Promise<{ success: boolean; models?: string[] }>`

- [ ] **Step 1: Add the method**

Read the file, add after the existing `setConfigOption` method:

```typescript
  /**
   * Test a provider connection by setting auth credentials and calling config/providers.
   * Returns success flag and optionally discovered model IDs.
   */
  async testConnection(
    provider: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<{ success: boolean; models?: string[] }> {
    if (!this.conn) throw new Error("AcpService not initialized");
    try {
      const credentials: Record<string, string> = { apiKey };
      if (baseUrl) credentials.baseUrl = baseUrl;
      await this.conn.extMethod("config/setAuth", { provider, credentials });
      const result = await this.conn.extMethod("config/providers", {});
      const models = (result as any)?.providers
        ?.find((p: any) => p.id === provider)
        ?.models?.map((m: any) => m.id || m.name) || undefined;
      return { success: true, models };
    } catch (err: any) {
      log.warn(`testConnection failed for ${provider}: ${err.message}`);
      return { success: false };
    }
  }
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

---

### Task 3: Add `chat:testConnection` IPC handler

**Files:**
- Modify: `src/main/ipc/chat.ts`

**Interfaces:**
- Consumes: `AcpService.testConnection` from Task 2

- [ ] **Step 1: Add IPC handler**

Read the file. Find where other `ipcMain.handle` calls are and add:

```typescript
  // ─── Test Provider Connection ───
  ipcMain.handle(
    "chat:testConnection",
    async (_event, args: { provider: string; apiKey: string; baseUrl?: string }) => {
      const service = getService();
      return await service.testConnection(args.provider, args.apiKey, args.baseUrl);
    },
  );
```

- [ ] **Step 2: Also add to preload**

Read `src/preload/index.ts`. Add `chatTestConnection` method alongside the other `chat*` methods:

```typescript
  chatTestConnection: (args: { provider: string; apiKey: string; baseUrl?: string }) =>
    ipcRenderer.invoke("chat:testConnection", args),
```

- [ ] **Step 3: Add type in electron.d.ts**

Find the `chatSend` type area and add:

```typescript
  chatTestConnection(args: { provider: string; apiKey: string; baseUrl?: string }): Promise<{ success: boolean; models?: string[] }>;
```

- [ ] **Step 4: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

---

### Task 4: Create `ProviderItem` component

**Files:**
- Create: `src/renderer/components/modules/settings/provider-item.tsx`

**Interfaces:**
- Consumes: `PROVIDER_REGISTRY`, `getThoughtLevels` from `@/lib/provider-registry`
- Consumes: `useSettingsStore` from settings-store
- Produces: `ProviderItem` component
- Props: `{ provider: ProviderMeta; isActive: boolean; isExpanded: boolean; onToggle: () => void }`

- [ ] **Step 1: Write the component**

```typescript
// src/renderer/components/modules/settings/provider-item.tsx
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon, Loader2Icon, CircleIcon, CheckIcon, PlusIcon, ChevronDownIcon } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { getThoughtLevels, type ProviderMeta } from "@/lib/provider-registry";

interface ProviderItemProps {
  provider: ProviderMeta;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ProviderItem({ provider, isActive, isExpanded, onToggle }: ProviderItemProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const aiApiKeys = settings.aiApiKeys || {};
  const aiModel = settings.aiModel ?? null;
  const thoughtLevel = settings.thoughtLevel;
  const verifiedProviders = settings.aiVerifiedProviders || [];
  const customModels = settings.aiCustomModels?.[provider.id] || [];

  const apiKey = aiApiKeys[provider.id] || "";
  const isVerified = verifiedProviders.includes(provider.id);

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "pass" | "fail">(isVerified ? "pass" : "idle");
  const [dynamicModels, setDynamicModels] = useState<string[]>([]);
  const [addingModel, setAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState("");

  // Merge models: dynamic + registry suggestions + custom, deduplicated
  const registryModels = provider.suggestions || [];
  const allModels = [...new Set([...dynamicModels, ...registryModels, ...customModels])];

  const handleTest = useCallback(async () => {
    if (!apiKey) return;
    setTesting(true);
    setTestResult("idle");
    try {
      const result = await window.electronAPI.chatTestConnection({
        provider: provider.id,
        apiKey,
      });
      if (result.success) {
        setTestResult("pass");
        if (result.models?.length) setDynamicModels(result.models);
        updateSettings({
          aiVerifiedProviders: [...new Set([...verifiedProviders, provider.id])],
        });
      } else {
        setTestResult("fail");
      }
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }, [apiKey, provider.id, verifiedProviders, updateSettings]);

  const handleSelectModel = (modelId: string) => {
    updateSettings({ aiModel: modelId });
  };

  const handleAddModel = () => {
    if (!newModelId.trim()) return;
    const updated = [...(settings.aiCustomModels?.[provider.id] || []), newModelId.trim()];
    updateSettings({
      aiCustomModels: { ...settings.aiCustomModels, [provider.id]: updated },
      aiModel: newModelId.trim(),
    });
    setNewModelId("");
    setAddingModel(false);
  };

  const levels = getThoughtLevels(provider.id);

  return (
    <div className={`rounded-lg border ${isActive ? "border-primary/50" : "border-border"}`}>
      {/* Header — click to expand */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
        onClick={onToggle}
      >
        <ChevronDownIcon className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
        <span className="flex-1 text-[length:var(--font-button)] font-medium">{provider.name}</span>
        {isVerified && <CircleIcon className="size-2.5 text-green-500 fill-current shrink-0" />}
        {isActive && <span className="text-[length:var(--font-hint)] text-muted-foreground">Active</span>}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-hint)] font-medium text-muted-foreground">API Key</label>
            <div className="flex items-center gap-1.5">
              <Input
                type={showKey ? "text" : "password"}
                className="text-[length:var(--font-input)] flex-1"
                placeholder={`${provider.name} API key...`}
                value={apiKey}
                onChange={(e) =>
                  updateSettings({ aiApiKeys: { ...aiApiKeys, [provider.id]: e.target.value } })
                }
              />
              <Button variant="ghost" size="icon-xs" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleTest}
                disabled={testing || !apiKey}
                title="Test connection"
              >
                {testing ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : testResult === "pass" ? (
                  <CircleIcon className="size-3 text-green-500 fill-current" />
                ) : testResult === "fail" ? (
                  <CircleIcon className="size-3 text-red-500 fill-current" />
                ) : (
                  <CircleIcon className="size-3 text-muted-foreground/30" />
                )}
              </Button>
            </div>
          </div>

          {/* Models */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-hint)] font-medium text-muted-foreground">Models</label>
            <div className="space-y-1">
              {allModels.map((modelId) => (
                <button
                  key={modelId}
                  type="button"
                  className={`flex items-center gap-2 w-full rounded-md px-3 py-1.5 text-[length:var(--font-chat-meta)] transition-colors ${
                    aiModel === modelId
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent text-muted-foreground"
                  }`}
                  onClick={() => handleSelectModel(modelId)}
                >
                  <span className="flex-1 text-left font-mono text-xs">{modelId}</span>
                  {aiModel === modelId && <CheckIcon className="size-3 shrink-0" />}
                </button>
              ))}
            </div>

            {/* Add custom model */}
            {addingModel ? (
              <div className="flex items-center gap-1.5">
                <Input
                  className="text-[length:var(--font-input)] flex-1 h-7"
                  placeholder="model-id"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddModel();
                    if (e.key === "Escape") setAddingModel(false);
                  }}
                  autoFocus
                />
                <Button variant="ghost" size="icon-xs" onClick={handleAddModel}>
                  <CheckIcon className="size-3" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="flex items-center gap-1.5 w-full rounded-md px-3 py-1.5 text-[length:var(--font-hint)] text-muted-foreground hover:bg-accent transition-colors"
                onClick={() => setAddingModel(true)}
              >
                <PlusIcon className="size-3" />
                <span>Add model...</span>
              </button>
            )}
          </div>

          {/* Reasoning Depth */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-hint)] font-medium text-muted-foreground">Reasoning Depth</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-1.5 text-[length:var(--font-chat-meta)]"
              value={thoughtLevel || ""}
              onChange={(e) => updateSettings({ thoughtLevel: e.target.value || undefined })}
            >
              <option value="">Provider default</option>
              {levels.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

---

### Task 5: Rewrite `external-settings.tsx`

**Files:**
- Modify: `src/renderer/components/modules/settings/external-settings.tsx`

**Interfaces:**
- Consumes: `ProviderItem` from Task 4, `PROVIDER_REGISTRY` from provider-registry

- [ ] **Step 1: Replace the file**

Read the file, then REPLACE entirely:

```typescript
// src/renderer/components/modules/settings/external-settings.tsx
import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { PROVIDER_REGISTRY } from "@/lib/provider-registry";
import { ProviderItem } from "./provider-item";

export function ExternalSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const aiProvider = settings.aiProvider || "anthropic";
  const [expandedId, setExpandedId] = useState<string | null>(aiProvider);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">AI Providers</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Configure AI providers, API keys, and model selection.
          </p>
        </div>

        {/* Provider list */}
        <div className="space-y-2">
          {PROVIDER_REGISTRY.map((p) => (
            <ProviderItem
              key={p.id}
              provider={p}
              isActive={aiProvider === p.id}
              isExpanded={expandedId === p.id}
              onToggle={() =>
                setExpandedId(expandedId === p.id ? null : p.id)
              }
            />
          ))}
        </div>

        <div className="border-t border-border" />

        {/* Zotero — unchanged */}
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-[length:var(--font-button)] font-medium">Zotero</p>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground">
              Sync references from your Zotero library.
            </p>
          </div>
          <ZoteroSection />
        </div>
      </div>
    </div>
  );
}

function ZoteroSection() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[length:var(--font-hint)] font-medium text-muted-foreground">API Key</label>
        <div className="flex items-center gap-1.5">
          <input
            type={showKey ? "text" : "password"}
            className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
            placeholder="Enter Zotero API key..."
            value={settings.zoteroApiKey || ""}
            onChange={(e) => updateSettings({ zoteroApiKey: e.target.value })}
          />
          <button
            type="button"
            className="inline-flex items-center justify-center size-8 rounded-md hover:bg-accent"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? (
              <svg className="size-3.5" /* EyeOff */ viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            ) : (
              <svg className="size-3.5" /* Eye */ viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[length:var(--font-hint)] font-medium text-muted-foreground">User ID</label>
        <input
          className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
          placeholder="123456"
          value={settings.zoteroUserId || ""}
          onChange={(e) => updateSettings({ zoteroUserId: e.target.value })}
        />
      </div>
    </div>
  );
}
```

Wait — the ZoteroSection uses raw SVG. Use lucide icons instead. Replace the Eye/EyeOff SVGs with lucide-react `EyeIcon`/`EyeOffIcon` imports:

```typescript
import { EyeIcon, EyeOffIcon } from "lucide-react";
```

And replace the raw SVGs with `<EyeOffIcon className="size-3.5" />` / `<EyeIcon className="size-3.5" />`.

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

---

### Task 6: Final verification

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

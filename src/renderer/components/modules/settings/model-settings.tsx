// components/modules/settings/model-settings.tsx
import { useState, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  EyeIcon, EyeOffIcon, CircleIcon, Loader2Icon, PlusIcon, XIcon, CheckIcon, ChevronDownIcon, Settings2Icon,
} from "lucide-react";
import { ALL_PROVIDERS, type ProviderConfig, type ModelConfig } from "@/lib/providers";
import { AddProviderDialog } from "./add-provider-dialog";

// ── Shared tokens ──
const CARD = "rounded-lg border border-border px-4 py-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
const SUB_ROW = "flex items-center justify-between py-1.5 group";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium leading-none";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const RESET_ICON =
  "opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground";

export function ModelSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const customProviders = settings.aiCustomProviders || [];

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | undefined>();

  const handleOpenEdit = (providerId: string) => {
    setEditProviderId(providerId);
    setAddDialogOpen(true);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Models</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Configure AI providers and choose available models.
          </p>
        </div>

        {/* Built-in providers */}
        <div className={CARD}>
          {ALL_PROVIDERS.filter((p) => p.id !== "custom").map((p) => (
            <ProviderRows key={p.id} provider={p} />
          ))}
        </div>

        {/* Custom providers */}
        {customProviders.length > 0 && (
          <div>
            <h3 className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">Custom</h3>
            <div className={CARD}>
              {customProviders.map((cp) => (
                <CustomProviderRow
                  key={cp.id}
                  provider={cp}
                  onConfigure={() => handleOpenEdit(cp.id)}
                />
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => { setEditProviderId(undefined); setAddDialogOpen(true); }}
        >
          <PlusIcon className="size-3" />
          Add Provider…
        </button>

        <AddProviderDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          editProviderId={editProviderId}
        />
      </div>
    </div>
  );
}

/** Row for a custom provider — uses same expandable model view as built-in. */
function CustomProviderRow({
  provider,
  onConfigure,
}: {
  provider: { id: string; name: string; baseUrl: string };
  onConfigure: () => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const enabledModels = settings.aiEnabledModels?.[provider.id];
  const customModelsData = (settings.aiCustomModelsData?.[provider.id] || []) as ModelConfig[];
  const [expanded, setExpanded] = useState(true);

  const allModelIds = [
    ...new Set([...customModelsData.map((m) => m.id)]),
  ];

  const isModelEnabled = (modelId: string) => enabledModels ? enabledModels.includes(modelId) : true;

  const toggleModel = (modelId: string) => {
    const current = enabledModels || allModelIds;
    const next = current.includes(modelId) ? current.filter((m) => m !== modelId) : [...current, modelId];
    updateSettings({ aiEnabledModels: { ...settings.aiEnabledModels, [provider.id]: next } });
  };

  const modelCount = enabledModels?.length || 0;

  return (
    <div className="pb-4">
      <div className={ROW} onClick={() => setExpanded(!expanded)}>
        <span className="flex items-center gap-1.5 cursor-default">
          <ChevronDownIcon className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "" : "-rotate-90"}`} />
          <p className={ROW_LABEL}>{provider.name}</p>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="!h-6 !text-[length:var(--font-size-11)] !px-2"
          onClick={(e) => { e.stopPropagation(); onConfigure(); }}
        >
          <Settings2Icon className="size-3 mr-1" />
          Configure
        </Button>
      </div>
      {expanded && allModelIds.length > 0 && allModelIds.map((modelId) => {
        const model = customModelsData.find((m) => m.id === modelId);
        const enabled = isModelEnabled(modelId);
        return (
          <div key={modelId} className={`${SUB_ROW} pl-8 cursor-pointer`} onClick={() => toggleModel(modelId)}>
            <div className="flex items-center gap-3">
              <Checkbox checked={enabled} onCheckedChange={() => toggleModel(modelId)} />
              <p className={`flex-1 ${enabled ? "text-[length:var(--font-size-12)] text-foreground/80" : "text-[length:var(--font-size-12)] text-foreground/40"} leading-none`}>
                {model?.name || modelId}
              </p>
            </div>
            {model?.contextWindow && (
              <span className="text-[length:var(--font-size-11)] text-foreground/50">{model.contextWindow}</span>
            )}
          </div>
        );
      })}
      {expanded && allModelIds.length === 0 && (
        <div className={`${SUB_ROW} pl-8`}>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">No models — click Configure to set up</p>
        </div>
      )}
    </div>
  );
}

function ProviderRows({ provider, onRemove }: { provider: ProviderConfig; onRemove?: () => void }) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const aiApiKeys = settings.aiApiKeys || {};
  const verifiedProviders = settings.aiVerifiedProviders || [];
  const customModelsData = (settings.aiCustomModelsData?.[provider.id] || []) as ModelConfig[];
  const enabledModels = settings.aiEnabledModels?.[provider.id];

  const apiKey = aiApiKeys[provider.id] || "";
  const isVerified = verifiedProviders.includes(provider.id);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "pass" | "fail">(isVerified ? "pass" : "idle");
  const [expanded, setExpanded] = useState(true);
  const [addingModel, setAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState("");

  const registryModels = provider.models || [];
  const customModelIds = customModelsData.map((m: ModelConfig) => m.id);
  const allModelIds = [...new Set([...registryModels.map((m) => m.id), ...customModelIds])];

  const handleTest = useCallback(async () => {
    if (!apiKey) return;
    setTesting(true);
    setTestResult("idle");
    try {
      const r = await window.electronAPI.chatTestConnection({ provider: provider.id, apiKey });
      setTestResult(r.success ? "pass" : "fail");
      if (r.success) updateSettings({ aiVerifiedProviders: [...new Set([...verifiedProviders, provider.id])] });
    } catch { setTestResult("fail"); }
    finally { setTesting(false); }
  }, [apiKey, provider.id, verifiedProviders, updateSettings]);

  const toggleModel = (modelId: string) => {
    const current = enabledModels || registryModels.map((m) => m.id);
    const next = current.includes(modelId) ? current.filter((m) => m !== modelId) : [...current, modelId];
    updateSettings({ aiEnabledModels: { ...settings.aiEnabledModels, [provider.id]: next } });
  };

  const isModelEnabled = (modelId: string) => enabledModels ? enabledModels.includes(modelId) : true;

  const getModelContextWindow = (modelId: string): string => {
    const staticModel = registryModels.find((m) => m.id === modelId);
    if (staticModel) return staticModel.contextWindow;
    const customModel = customModelsData.find((m: ModelConfig) => m.id === modelId);
    return customModel?.contextWindow ?? "";
  };

  const handleAddModel = () => {
    if (!newModelId.trim()) return;
    const mid = newModelId.trim();
    const newCustom: ModelConfig = { id: mid, name: mid, contextWindow: "Unknown" };
    updateSettings({
      aiCustomModelsData: {
        ...settings.aiCustomModelsData,
        [provider.id]: [...customModelsData, newCustom],
      },
      aiEnabledModels: {
        ...settings.aiEnabledModels,
        [provider.id]: [...(enabledModels || registryModels.map((m) => m.id)), mid],
      },
    });
    setNewModelId("");
    setAddingModel(false);
  };

  const allEnabled = allModelIds.length > 0 && allModelIds.every((m) => isModelEnabled(m));
  const someEnabled = allModelIds.some((m) => isModelEnabled(m));
  const checkedState = allModelIds.length === 0 ? false : (allEnabled ? true : (someEnabled ? "indeterminate" as const : false));

  return (
    <div className="pb-4">
      {/* Provider header row */}
      <div className={ROW} onClick={() => setExpanded(!expanded)}>
        <span className="flex items-center gap-1.5 cursor-default">
          <Checkbox
            checked={checkedState}
            onCheckedChange={(checked) => {
              const enableAll = checked === true || checked === "indeterminate";
              const next = enableAll ? [...new Set([...(enabledModels || registryModels.map((m) => m.id)), ...allModelIds])] : [];
              updateSettings({ aiEnabledModels: { ...settings.aiEnabledModels, [provider.id]: next } });
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <ChevronDownIcon
            className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          <p className={ROW_LABEL}>{provider.name}</p>
        </span>
        <Button
          variant="outline"
          size="sm"
          className={`!h-6 !text-[length:var(--font-size-11)] !px-2 ${
            apiKey && testResult === "pass"
              ? "!border-green-500"
              : apiKey && testResult === "fail"
                ? "!border-red-500"
                : ""
          }`}
          onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
        >
          {onRemove ? "Configure" : (apiKey ? "••••" : "Set API Key…")}
        </Button>
      </div>

      {/* API Key Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{onRemove ? "Configure Provider" : `${provider.name} API Key`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {onRemove && (
              <>
                <Input
                  className="!h-8 !text-[length:var(--font-size-12)]"
                  placeholder="Provider name"
                  value={provider.name}
                  onChange={(e) => {
                    const providers = settings.aiCustomProviders || [];
                    updateSettings({
                      aiCustomProviders: providers.map((x) =>
                        x.id === provider.id ? { ...x, name: e.target.value } : x
                      ),
                    });
                  }}
                />
                <Input
                  className="!h-8 !text-[length:var(--font-size-12)]"
                  placeholder="Base URL (e.g. https://api.openai.com/v1)"
                  value={settings.aiBaseUrls?.[provider.id] || ""}
                  onChange={(e) =>
                    updateSettings({ aiBaseUrls: { ...settings.aiBaseUrls, [provider.id]: e.target.value } })
                  }
                />
              </>
            )}
            <div className="flex items-center gap-1.5">
              <Input
                type={showKey ? "text" : "password"}
                className="!h-8 !text-[length:var(--font-size-12)] flex-1"
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => {
                  updateSettings({ aiApiKeys: { ...aiApiKeys, [provider.id]: e.target.value } });
                  setTestResult("idle");
                }}
              />
              <Button variant="ghost" size="icon-xs" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </Button>
            </div>
            <div className="flex items-center gap-2 justify-end">
              {testResult === "pass" && (
                <span className="text-[length:var(--font-size-12)] text-green-500 flex items-center gap-1 mr-1">
                  <CircleIcon className="size-2.5 fill-current" /> Verified
                </span>
              )}
              {testResult === "fail" && (
                <span className="text-[length:var(--font-size-12)] text-red-500 flex items-center gap-1 mr-1">
                  <CircleIcon className="size-2.5 fill-current" /> Failed
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="!h-7 !text-[length:var(--font-size-12)]"
                onClick={handleTest}
                disabled={testing || !apiKey}
              >
                {testing && <Loader2Icon className="size-3 animate-spin mr-1" />}
                Test Connection
              </Button>
              {onRemove && (
                <Button
                  variant="outline"
                  size="sm"
                  className="!h-7 !text-[length:var(--font-size-12)] border-red-500/30 text-red-500 hover:bg-red-500/10"
                  onClick={() => { onRemove(); setDialogOpen(false); }}
                >
                  Remove
                </Button>
              )}
              <Button
                size="sm"
                className="!h-7 !text-[length:var(--font-size-12)]"
                onClick={() => setDialogOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Model rows */}
      {expanded && allModelIds.map((modelId) => {
        const isCustom = customModelIds.includes(modelId);
        const enabled = isModelEnabled(modelId);
        return (
          <div key={modelId} className={`${SUB_ROW} pl-8 cursor-pointer`} onClick={() => toggleModel(modelId)}>
            <div className="flex items-center gap-3">
              <Checkbox checked={enabled} onCheckedChange={() => toggleModel(modelId)} />
              <p className={`flex-1 ${enabled ? "text-[length:var(--font-size-12)] text-foreground/80" : "text-[length:var(--font-size-12)] text-foreground/40"} leading-none`}>
                {modelId}
                {getModelContextWindow(modelId) && (
                  <span className="ml-2 text-[length:var(--font-size-11)] text-foreground/50 font-normal">
                    {getModelContextWindow(modelId)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isCustom && (
                <button
                  className={RESET_ICON}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateSettings({
                      aiCustomModelsData: {
                        ...settings.aiCustomModelsData,
                        [provider.id]: customModelsData.filter((m) => m.id !== modelId),
                      },
                    });
                  }}
                  title="Remove model"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Add model row — only OpenRouter supports custom models */}
      {expanded && provider.id === "openrouter" && (
        addingModel ? (
          <div className={`${SUB_ROW} pl-8`}>
            <div className="flex items-center gap-3 flex-1">
              <Input
                className="!h-7 !text-[length:var(--font-size-12)] font-mono flex-1"
                placeholder="model-id"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddModel();
                  if (e.key === "Escape") setAddingModel(false);
                }}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="ghost" size="icon-xs" onClick={handleAddModel}>
                <CheckIcon className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setAddingModel(false)}>
                <XIcon className="size-3" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={`${SUB_ROW} pl-8 w-full text-left`}
            onClick={() => setAddingModel(true)}
          >
            <span className="flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors">
              <PlusIcon className="size-3" />
              Add model…
            </span>
          </button>
        )
      )}
    </div>
  );
}

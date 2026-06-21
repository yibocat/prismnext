// src/renderer/components/modules/settings/add-provider-dialog.tsx
import { useState, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  EyeIcon, EyeOffIcon, Loader2Icon, PlusIcon, XIcon, CheckIcon,
} from "lucide-react";
import {
  PROVIDER_PRESETS, CUSTOM_PRESET, getPreset,
} from "@/lib/providers/presets";
import type { ProviderConfig } from "@/lib/providers/types";
import type { ModelConfig } from "@/lib/providers/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, we're editing this existing provider instead of adding */
  editProviderId?: string;
}

export function AddProviderDialog({ open, onOpenChange, editProviderId }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const customProviders = settings.aiCustomProviders || [];
  const aiApiKeys = settings.aiApiKeys || {};
  const aiBaseUrls = settings.aiBaseUrls || {};

  // Check if editing existing
  const existing = editProviderId
    ? customProviders.find((cp) => cp.id === editProviderId)
    : undefined;
  const isEditing = !!existing;

  const allPresets = [...PROVIDER_PRESETS, CUSTOM_PRESET];
  const initialPresetId = existing
    ? (getPreset(existing.id)?.id || "__custom__")
    : PROVIDER_PRESETS[0].id;

  const [presetId, setPresetId] = useState(initialPresetId);
  const [name, setName] = useState(existing?.name || "");
  const [baseUrl, setBaseUrl] = useState(
    existing
      ? (aiBaseUrls[existing.id] || getPreset(existing.id)?.defaultBaseUrl || "")
      : getPreset(initialPresetId)?.defaultBaseUrl || "",
  );
  const [apiKey, setApiKey] = useState(
    existing ? (aiApiKeys[existing.id] || "") : "",
  );
  const [showKey, setShowKey] = useState(false);

  // Models: merge preset models + custom models
  const currentPreset = getPreset(presetId);
  const presetModels = currentPreset?.models || [];
  const existingCustomModels = (settings.aiCustomModelsData?.[editProviderId || ""] || []) as ModelConfig[];

  // Selected model IDs
  const [selectedModels, setSelectedModels] = useState<Set<string>>(() => {
    if (existing) {
      const enabled = settings.aiEnabledModels?.[existing.id];
      if (enabled) return new Set(enabled);
      return new Set(presetModels.map((m) => m.id));
    }
    return new Set(presetModels.map((m) => m.id));
  });

  // Custom user-typed models
  const [customModels, setCustomModels] = useState<ModelConfig[]>(
    isEditing ? existingCustomModels.filter((m) => !presetModels.find((p) => p.id === m.id)) : [],
  );
  const [newModelId, setNewModelId] = useState("");
  const [addingModel, setAddingModel] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState(false);

  const providerId = isEditing
    ? existing!.id
    : presetId === "__custom__"
      ? `custom-${Date.now()}`
      : presetId;

  const handlePresetChange = (newPresetId: string) => {
    setPresetId(newPresetId);
    const preset = getPreset(newPresetId);
    if (preset && preset.id !== "__custom__") {
      setName(preset.name);
      setBaseUrl(preset.defaultBaseUrl);
      setSelectedModels(new Set(preset.models.map((m) => m.id)));
      setCustomModels([]);
    } else if (newPresetId === "__custom__") {
      setName("");
      setBaseUrl("");
      setSelectedModels(new Set());
      setCustomModels([]);
    }
  };

  const toggleModel = (modelId: string) => {
    const next = new Set(selectedModels);
    if (next.has(modelId)) next.delete(modelId);
    else next.add(modelId);
    setSelectedModels(next);
  };

  const handleAddCustomModel = () => {
    if (!newModelId.trim()) return;
    const mid = newModelId.trim();
    setCustomModels([...customModels, { id: mid, name: mid, contextWindow: "" }]);
    setSelectedModels(new Set([...selectedModels, mid]));
    setNewModelId("");
    setAddingModel(false);
  };

  const handleRemoveCustomModel = (modelId: string) => {
    setCustomModels(customModels.filter((m) => m.id !== modelId));
    const next = new Set(selectedModels);
    next.delete(modelId);
    setSelectedModels(next);
  };

  const allSelectedModels = [
    ...presetModels.filter((m) => selectedModels.has(m.id)),
    ...customModels.filter((m) => selectedModels.has(m.id)),
  ];

  const handleSave = useCallback(async () => {
    // Require API key
    if (!apiKey.trim()) {
      setApiKeyError(true);
      return;
    }
    setApiKeyError(false);
    setSaveError(null);

    const effectiveName = name || currentPreset?.name || "Custom Provider";
    const effectiveBaseUrl = baseUrl || currentPreset?.defaultBaseUrl || "";

    // Auto-test connection before saving
    setSaving(true);
    try {
      const r = await window.electronAPI.chatTestConnection({
        provider: presetId === "__custom__" ? "custom" : presetId,
        apiKey: apiKey.trim(),
        baseUrl: effectiveBaseUrl || undefined,
      });
      if (!r.success) {
        setSaveError("Connection test failed — check your API key and Base URL");
        setSaving(false);
        return;
      }
    } catch {
      setSaveError("Connection test failed — check network");
      setSaving(false);
      return;
    }

    const enabledModelIds = [...selectedModels];

    if (isEditing) {
      updateSettings({
        aiCustomProviders: customProviders.map((cp) =>
          cp.id === editProviderId
            ? { ...cp, name: effectiveName }
            : cp,
        ),
        aiBaseUrls: { ...aiBaseUrls, [editProviderId!]: effectiveBaseUrl },
        aiApiKeys: { ...aiApiKeys, [editProviderId!]: apiKey.trim() },
        aiEnabledModels: { ...settings.aiEnabledModels, [editProviderId!]: enabledModelIds },
        aiCustomModelsData: {
          ...settings.aiCustomModelsData,
          [editProviderId!]: customModels,
        },
      });
    } else {
      updateSettings({
        aiCustomProviders: [...customProviders, { id: providerId, name: effectiveName, baseUrl: effectiveBaseUrl }],
        aiBaseUrls: { ...aiBaseUrls, [providerId]: effectiveBaseUrl },
        aiApiKeys: { ...aiApiKeys, [providerId]: apiKey.trim() },
        aiEnabledModels: { ...settings.aiEnabledModels, [providerId]: enabledModelIds },
        aiCustomModelsData: {
          ...settings.aiCustomModelsData,
          [providerId]: customModels,
        },
      });
    }

    setSaving(false);
    onOpenChange(false);
  }, [apiKey, presetId, baseUrl, name, selectedModels, customModels, isEditing, editProviderId, providerId, customProviders, aiApiKeys, aiBaseUrls, settings, updateSettings, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Configure Provider" : "Add Provider"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Provider selector */}
          {!isEditing && (
            <div className="space-y-1.5">
              <label className="text-[length:var(--font-size-12)] font-medium">Provider</label>
              <Select value={presetId} onValueChange={handlePresetChange}>
                <SelectTrigger className="!h-8 !text-[length:var(--font-size-12)] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allPresets.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="!text-[length:var(--font-size-12)]">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Name (only for Custom) */}
          {(presetId === "__custom__" || isEditing) && (
            <div className="space-y-1.5">
              <label className="text-[length:var(--font-size-12)] font-medium">Name</label>
              <Input
                className="!h-8 !text-[length:var(--font-size-12)]"
                placeholder="My Provider"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium">Base URL</label>
            <Input
              className="!h-8 !text-[length:var(--font-size-12)] font-mono"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {/* Models */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium">Models</label>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-md p-2">
              {/* Preset models */}
              {presetModels.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded px-2 py-1 cursor-pointer hover:bg-accent"
                  onClick={() => toggleModel(m.id)}
                >
                  <Checkbox checked={selectedModels.has(m.id)} onCheckedChange={() => toggleModel(m.id)} />
                  <span className="flex-1 text-[length:var(--font-size-12)] text-foreground">{m.name}</span>
                  <span className="text-[length:var(--font-size-11)] text-muted-foreground/60">{m.contextWindow}</span>
                </div>
              ))}

              {/* Custom models */}
              {customModels.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded px-2 py-1 cursor-pointer hover:bg-accent group"
                  onClick={() => toggleModel(m.id)}
                >
                  <Checkbox checked={selectedModels.has(m.id)} onCheckedChange={() => toggleModel(m.id)} />
                  <span className="flex-1 text-[length:var(--font-size-12)] text-foreground font-mono">{m.id}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleRemoveCustomModel(m.id); }}
                  >
                    <XIcon className="size-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}

              {/* Add custom model */}
              {addingModel ? (
                <div className="flex items-center gap-1.5 px-2">
                  <Input
                    className="!h-7 !text-[length:var(--font-size-12)] font-mono flex-1"
                    placeholder="model-id"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCustomModel();
                      if (e.key === "Escape") setAddingModel(false);
                    }}
                    autoFocus
                  />
                  <Button variant="ghost" size="icon-xs" onClick={handleAddCustomModel}>
                    <CheckIcon className="size-3" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => setAddingModel(false)}>
                    <XIcon className="size-3" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 w-full rounded px-2 py-1 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  onClick={() => setAddingModel(true)}
                >
                  <PlusIcon className="size-3" />
                  Add model…
                </button>
              )}

              {allSelectedModels.length === 0 && !addingModel && (
                <p className="text-[length:var(--font-size-12)] text-muted-foreground text-center py-2">
                  No models selected
                </p>
              )}
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium">API Key</label>
            <div className="flex items-center gap-1.5">
              <Input
                type={showKey ? "text" : "password"}
                className={`!h-8 !text-[length:var(--font-size-12)] flex-1 ${apiKeyError ? "!border-red-500" : ""}`}
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setApiKeyError(false); setSaveError(null); }}
              />
              <Button variant="ghost" size="icon-xs" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </Button>
            </div>
          </div>

          {/* API key error */}
          {apiKeyError && (
            <p className="text-[length:var(--font-size-12)] text-red-500">API Key is required.</p>
          )}
          {saveError && (
            <p className="text-[length:var(--font-size-12)] text-red-500">{saveError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end pt-2">
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="!h-7 !text-[length:var(--font-size-12)] border-red-500/30 text-red-500 hover:bg-red-500/10 mr-auto"
                onClick={() => {
                  updateSettings({
                    aiCustomProviders: customProviders.filter((x) => x.id !== editProviderId),
                  });
                  onOpenChange(false);
                }}
              >
                Remove
              </Button>
            )}
            <Button
              size="sm"
              className="!h-7 !text-[length:var(--font-size-12)]"
              onClick={handleSave}
              disabled={saving || allSelectedModels.length === 0}
            >
              {saving && <Loader2Icon className="size-3 animate-spin mr-1" />}
              {isEditing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

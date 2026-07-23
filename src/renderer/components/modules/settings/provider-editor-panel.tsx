import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  PROVIDER_PRESETS,
  CUSTOM_PRESET,
  getPreset,
  buildCustomModelEntry,
  modelIdTaken,
} from "@/lib/providers";
import type { ModelConfig } from "@/lib/providers";
import { ModelCapabilityBadges } from "@/components/modules/chat/agent-settings/model-capability-badges";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_INPUT,
  SETTINGS_FORM_INPUT_MONO,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";

type ProviderEditorSlot = Extract<SettingsPanelSlot, { kind: "ai-provider" }>;

type ConnectionStatus = "none" | "verified" | "failed" | "untested";

function connectionMeta(
  status: ConnectionStatus,
  t: (key: string) => string,
): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  switch (status) {
    case "verified":
      return {
        label: t("settings.editor.provider.statusConnected"),
        dotClass: "bg-success",
        textClass: "text-success",
      };
    case "failed":
      return {
        label: t("settings.editor.provider.statusFailed"),
        dotClass: "bg-destructive",
        textClass: "text-destructive",
      };
    case "untested":
      return {
        label: t("settings.editor.provider.statusKeySet"),
        dotClass: "bg-warning",
        textClass: "text-warning",
      };
    default:
      return {
        label: t("settings.editor.provider.statusNoKey"),
        dotClass: "bg-muted-foreground/35",
        textClass: "text-muted-foreground",
      };
  }
}

function ConnectionStatusLine({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  const meta = connectionMeta(status, t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[length:var(--font-size-11)]",
        meta.textClass,
      )}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", meta.dotClass)} />
      {meta.label}
    </span>
  );
}

const MODEL_ROW =
  "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors";

export function ProviderEditorPanel({ slot }: { slot: ProviderEditorSlot }) {
  const { t } = useTranslation();
  if (slot.mode === "builtin-key") {
    return <BuiltinProviderKeyPanel providerId={slot.providerId} />;
  }
  return <CustomProviderEditorPanel slot={slot} />;
}

function BuiltinProviderKeyPanel({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const aiApiKeys = settings.aiApiKeys || {};
  const verifiedProviders = settings.aiVerifiedProviders || [];
  const apiKey = aiApiKeys[providerId] || "";
  const isVerified = verifiedProviders.includes(providerId);

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "pass" | "fail">(
    isVerified ? "pass" : "idle",
  );

  useEffect(() => {
    setShowKey(false);
    setTesting(false);
    setTestResult(isVerified ? "pass" : "idle");
  }, [providerId, isVerified]);

  const connectionStatus: ConnectionStatus = !apiKey
    ? "none"
    : testResult === "pass" || isVerified
      ? "verified"
      : testResult === "fail"
        ? "failed"
        : "untested";

  const handleTest = useCallback(async () => {
    if (!apiKey) return;
    setTesting(true);
    setTestResult("idle");
    try {
      const result = await window.electronAPI.chatTestConnection({
        provider: providerId,
        apiKey,
      });
      setTestResult(result.success ? "pass" : "fail");
      if (result.success) {
        updateSettings({
          aiVerifiedProviders: [...new Set([...verifiedProviders, providerId])],
        });
        toast.success(t("settings.editor.provider.toast.verified"));
      } else {
        toast.error(t("settings.editor.provider.toast.testFailedDetail"));
      }
    } catch {
      setTestResult("fail");
      toast.error(t("settings.editor.provider.testFailedNetwork"));
    } finally {
      setTesting(false);
    }
  }, [apiKey, providerId, verifiedProviders, updateSettings, t]);

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {t("settings.editor.provider.builtinIntro")}
        </p>

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField
            label={t("settings.editor.provider.apiKey")}
            htmlFor="builtin-provider-api-key"
          >
            <div className="flex items-center gap-1.5">
              <Input
                id="builtin-provider-api-key"
                type={showKey ? "text" : "password"}
                className={cn(SETTINGS_FORM_INPUT_MONO, "flex-1")}
                placeholder={t("settings.editor.provider.apiKeyPlaceholder")}
                value={apiKey}
                onChange={(e) => {
                  updateSettings({ aiApiKeys: { ...aiApiKeys, [providerId]: e.target.value } });
                  setTestResult("idle");
                }}
              />
              <Button variant="ghost" size="icon-xs" onClick={() => setShowKey((v) => !v)}>
                {showKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </Button>
            </div>
            <ConnectionStatusLine status={connectionStatus} />
            <Button
              variant="outline"
              size="xs"
              className="mt-2"
              onClick={() => void handleTest()}
              disabled={testing || !apiKey}
            >
              {testing ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
              {t("common.testConnection")}
            </Button>
          </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={closePanel}>
            Done
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CustomProviderEditorPanel({
  slot,
}: {
  slot: Extract<ProviderEditorSlot, { mode: "new" } | { mode: "edit" }>;
}) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const customProviders = settings.aiCustomProviders || [];
  const aiApiKeys = settings.aiApiKeys || {};
  const aiBaseUrls = settings.aiBaseUrls || {};

  const editProviderId = slot.mode === "edit" ? slot.providerId : undefined;
  const existing = editProviderId
    ? customProviders.find((cp) => cp.id === editProviderId)
    : undefined;
  const isEditing = !!existing;

  const allPresets = [...PROVIDER_PRESETS, CUSTOM_PRESET];
  const addedPresetIds = useMemo(
    () => new Set(customProviders.map((cp) => cp.id)),
    [customProviders],
  );
  const isPresetAlreadyAdded = (id: string) =>
    id !== CUSTOM_PRESET.id && addedPresetIds.has(id);

  const pickInitialPresetId = useCallback(
    (forExisting?: typeof existing) => {
      if (forExisting) {
        return getPreset(forExisting.id)?.id || CUSTOM_PRESET.id;
      }
      const firstAvailable = PROVIDER_PRESETS.find((p) => !addedPresetIds.has(p.id));
      return firstAvailable?.id ?? CUSTOM_PRESET.id;
    },
    [addedPresetIds],
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [presetId, setPresetId] = useState(PROVIDER_PRESETS[0].id);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [customModels, setCustomModels] = useState<ModelConfig[]>([]);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newModelContext, setNewModelContext] = useState("");
  const [newModelVision, setNewModelVision] = useState(false);
  const [addModelError, setAddModelError] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "pass" | "fail">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState(false);

  useEffect(() => {
    const initialPresetId = pickInitialPresetId(existing);
    const preset = getPreset(initialPresetId);
    const presetModels = preset?.models || [];
    const existingCustomModels = (settings.aiCustomModelsData?.[editProviderId || ""] ||
      []) as ModelConfig[];

    setDeleteDialogOpen(false);
    setPresetId(initialPresetId);
    setName(existing?.name || "");
    setBaseUrl(
      existing
        ? aiBaseUrls[existing.id] || getPreset(existing.id)?.defaultBaseUrl || ""
        : preset?.defaultBaseUrl || "",
    );
    setApiKey(existing ? aiApiKeys[existing.id] || "" : "");
    setShowKey(false);
    setNewModelId("");
    setNewModelName("");
    setNewModelContext("");
    setNewModelVision(false);
    setAddModelError(null);
    setAddingModel(false);
    setSaving(false);
    setTesting(false);
    setTestResult(
      existing &&
        editProviderId &&
        (settings.aiVerifiedProviders || []).includes(editProviderId)
        ? "pass"
        : "idle",
    );
    setSaveError(null);
    setApiKeyError(false);

    if (existing) {
      const enabled = settings.aiEnabledModels?.[existing.id];
      setSelectedModels(
        new Set(enabled ?? presetModels.map((m) => m.id)),
      );
      setCustomModels(
        existingCustomModels.filter((m) => !presetModels.find((p) => p.id === m.id)),
      );
    } else {
      setSelectedModels(new Set(presetModels.map((m) => m.id)));
      setCustomModels([]);
    }
  }, [slot.mode, editProviderId, existing?.name, existing?.id, pickInitialPresetId]);

  const currentPreset = getPreset(presetId);
  const presetModels = currentPreset?.models || [];

  const providerId = isEditing
    ? existing!.id
    : presetId === "__custom__"
      ? `custom-${Date.now()}`
      : presetId;

  const handlePresetChange = (newPresetId: string) => {
    if (isPresetAlreadyAdded(newPresetId)) return;
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
    setSaveError(null);
    setTestResult("idle");
  };

  const toggleModel = (modelId: string) => {
    const next = new Set(selectedModels);
    if (next.has(modelId)) next.delete(modelId);
    else next.add(modelId);
    setSelectedModels(next);
  };

  const handleAddCustomModel = () => {
    const mid = newModelId.trim();
    if (!mid) {
      setAddModelError(t("settings.editor.provider.modelIdRequired"));
      return;
    }
    if (modelIdTaken(mid, presetModels, customModels)) {
      setAddModelError(t("settings.editor.provider.modelIdExists"));
      return;
    }
    const entry = buildCustomModelEntry(mid, newModelName, newModelContext, {
      vision: newModelVision,
    });
    setCustomModels([...customModels, entry]);
    setSelectedModels(new Set([...selectedModels, mid]));
    setNewModelId("");
    setNewModelName("");
    setNewModelContext("");
    setNewModelVision(false);
    setAddModelError(null);
    setAddingModel(false);
  };

  const openAddModelForm = () => {
    setNewModelId("");
    setNewModelName("");
    setNewModelContext("");
    setNewModelVision(false);
    setAddModelError(null);
    setAddingModel(true);
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

  const isVerifiedInSettings =
    isEditing &&
    editProviderId &&
    (settings.aiVerifiedProviders || []).includes(editProviderId);

  const connectionStatus: ConnectionStatus = !apiKey.trim()
    ? "none"
    : testResult === "pass" || isVerifiedInSettings
      ? "verified"
      : testResult === "fail"
        ? "failed"
        : "untested";

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) {
      setApiKeyError(true);
      return;
    }
    setApiKeyError(false);
    setSaveError(null);
    setTesting(true);
    setTestResult("idle");

    const effectiveBaseUrl = baseUrl || currentPreset?.defaultBaseUrl || "";

    try {
      const result = await window.electronAPI.chatTestConnection({
        provider: presetId === "__custom__" ? "custom" : presetId,
        apiKey: apiKey.trim(),
        baseUrl: effectiveBaseUrl || undefined,
      });
      setTestResult(result.success ? "pass" : "fail");
      if (result.success) {
        if (isEditing && editProviderId) {
          updateSettings({
            aiVerifiedProviders: [
              ...new Set([...(settings.aiVerifiedProviders || []), editProviderId]),
            ],
          });
        }
        toast.success(t("settings.editor.provider.toast.verified"));
      } else {
        toast.error(t("settings.editor.provider.toast.testFailedDetail"));
      }
    } catch {
      setTestResult("fail");
      toast.error(t("settings.editor.provider.testFailedNetwork"));
    } finally {
      setTesting(false);
    }
  }, [
    apiKey,
    baseUrl,
    currentPreset?.defaultBaseUrl,
    presetId,
    isEditing,
    editProviderId,
    settings.aiVerifiedProviders,
    updateSettings,
    t,
  ]);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) {
      setApiKeyError(true);
      return;
    }
    setApiKeyError(false);
    setSaveError(null);

    if (!isEditing && isPresetAlreadyAdded(presetId)) {
      setSaveError(t("settings.editor.provider.alreadyAdded"));
      return;
    }

    const effectiveName = name || currentPreset?.name || t("settings.editor.provider.customProvider");
    const effectiveBaseUrl = baseUrl || currentPreset?.defaultBaseUrl || "";

    setSaving(true);
    try {
      const r = await window.electronAPI.chatTestConnection({
        provider: presetId === "__custom__" ? "custom" : presetId,
        apiKey: apiKey.trim(),
        baseUrl: effectiveBaseUrl || undefined,
      });
      if (!r.success) {
        setSaveError(t("settings.editor.provider.toast.testFailedDetail"));
        setSaving(false);
        return;
      }
    } catch {
      setSaveError(t("settings.editor.provider.testFailedNetwork"));
      setSaving(false);
      return;
    }

    const enabledModelIds = [...selectedModels];

    if (isEditing) {
      updateSettings({
        aiCustomProviders: customProviders.map((cp) =>
          cp.id === editProviderId ? { ...cp, name: effectiveName } : cp,
        ),
        aiBaseUrls: { ...aiBaseUrls, [editProviderId!]: effectiveBaseUrl },
        aiApiKeys: { ...aiApiKeys, [editProviderId!]: apiKey.trim() },
        aiEnabledModels: { ...settings.aiEnabledModels, [editProviderId!]: enabledModelIds },
        aiCustomModelsData: {
          ...settings.aiCustomModelsData,
          [editProviderId!]: customModels,
        },
        aiVerifiedProviders: [...new Set([...(settings.aiVerifiedProviders || []), editProviderId!])],
      });
      toast.success(t("settings.editor.provider.toast.saved"));
    } else {
      updateSettings({
        aiCustomProviders: [
          ...customProviders,
          { id: providerId, name: effectiveName, baseUrl: effectiveBaseUrl },
        ],
        aiBaseUrls: { ...aiBaseUrls, [providerId]: effectiveBaseUrl },
        aiApiKeys: { ...aiApiKeys, [providerId]: apiKey.trim() },
        aiEnabledModels: { ...settings.aiEnabledModels, [providerId]: enabledModelIds },
        aiCustomModelsData: {
          ...settings.aiCustomModelsData,
          [providerId]: customModels,
        },
        aiVerifiedProviders: [...new Set([...(settings.aiVerifiedProviders || []), providerId])],
      });
      toast.success(t("settings.editor.provider.toast.added"));
    }

    setSaving(false);
    closePanel();
  }, [
    apiKey,
    presetId,
    baseUrl,
    name,
    selectedModels,
    customModels,
    isEditing,
    editProviderId,
    providerId,
    customProviders,
    aiApiKeys,
    aiBaseUrls,
    settings,
    updateSettings,
    currentPreset?.name,
    currentPreset?.defaultBaseUrl,
    closePanel,
    t,
    isPresetAlreadyAdded,
  ]);

  const removeProvider = () => {
    if (!editProviderId) return;
    setDeleteDialogOpen(false);
    updateSettings({
      aiCustomProviders: customProviders.filter((x) => x.id !== editProviderId),
    });
    toast.success(t("settings.editor.provider.toast.removed"));
    closePanel();
  };

  const showNameField = presetId === "__custom__" || isEditing;

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {isEditing
            ? t("settings.editor.provider.editIntro")
            : t("settings.editor.provider.addIntro")}
        </p>

        <div className={SETTINGS_DETAIL_SECTION}>
          {!isEditing ? (
            <SettingsFormField
              label={t("settings.editor.provider.provider")}
              htmlFor="provider-preset"
            >
              <AppSelect value={presetId} onValueChange={handlePresetChange}>
                <AppSelectTrigger id="provider-preset" variant="dialog" className="w-full">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {allPresets.map((p) => {
                    const alreadyAdded = isPresetAlreadyAdded(p.id);
                    return (
                      <AppSelectItem key={p.id} value={p.id} disabled={alreadyAdded}>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span>{p.name}</span>
                          {alreadyAdded ? (
                            <span className="text-[length:var(--font-size-10)] font-normal text-muted-foreground">
                              {t("settings.editor.provider.added")}
                            </span>
                          ) : null}
                        </span>
                      </AppSelectItem>
                    );
                  })}
                </AppSelectContent>
              </AppSelect>
            </SettingsFormField>
          ) : null}

          {showNameField ? (
            <SettingsFormField label={t("settings.editor.provider.name")} htmlFor="provider-name">
              <Input
                id="provider-name"
                className={SETTINGS_FORM_INPUT}
                placeholder={t("settings.editor.provider.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </SettingsFormField>
          ) : null}

          <SettingsFormField
            label={t("settings.editor.provider.baseUrl")}
            htmlFor="provider-base-url"
            description={t("settings.editor.provider.baseUrlDesc")}
          >
            <Input
              id="provider-base-url"
              className={SETTINGS_FORM_INPUT_MONO}
              placeholder={t("settings.editor.provider.baseUrlPlaceholder")}
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setTestResult("idle");
              }}
            />
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.provider.apiKey")}
            htmlFor="provider-api-key"
          >
            <div className="flex items-center gap-1.5">
              <Input
                id="provider-api-key"
                type={showKey ? "text" : "password"}
                className={cn(
                  SETTINGS_FORM_INPUT_MONO,
                  "flex-1",
                  apiKeyError && "!border-destructive",
                )}
                placeholder={t("settings.editor.provider.apiKeyPlaceholder")}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiKeyError(false);
                  setSaveError(null);
                  setTestResult("idle");
                }}
              />
              <Button variant="ghost" size="icon-xs" onClick={() => setShowKey((v) => !v)}>
                {showKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </Button>
            </div>
            {apiKeyError ? (
              <p className="text-[length:var(--font-size-12)] text-destructive">
                {t("settings.editor.provider.apiKeyRequired")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <ConnectionStatusLine status={connectionStatus} />
              <Button
                variant="outline"
                size="xs"
                onClick={() => void handleTest()}
                disabled={testing || !apiKey.trim()}
              >
                {testing ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
                {t("common.testConnection")}
              </Button>
            </div>
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.provider.models")}
            description={t("settings.editor.provider.modelsDesc")}
          >
            <div className="rounded-md border border-border divide-y divide-border/60">
              {presetModels.map((m) => (
                <div
                  key={m.id}
                  className={MODEL_ROW}
                  onClick={() => toggleModel(m.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleModel(m.id);
                    }
                  }}
                >
                  <Checkbox
                    checked={selectedModels.has(m.id)}
                    onCheckedChange={() => toggleModel(m.id)}
                  />
                  <div className="flex-1 min-w-0 text-[length:var(--font-size-12)]">
                    <p className="truncate">{m.name}</p>
                    <ModelCapabilityBadges model={m} />
                  </div>
                  {m.contextWindow ? (
                    <span className="text-[length:var(--font-size-11)] text-muted-foreground shrink-0">
                      {m.contextWindow}
                    </span>
                  ) : null}
                </div>
              ))}

              {customModels.map((m) => (
                <div
                  key={m.id}
                  className={cn(MODEL_ROW, "group")}
                  onClick={() => toggleModel(m.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleModel(m.id);
                    }
                  }}
                >
                  <Checkbox
                    checked={selectedModels.has(m.id)}
                    onCheckedChange={() => toggleModel(m.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[length:var(--font-size-12)] truncate">{m.name}</p>
                    {m.name !== m.id ? (
                      <p className="text-[length:var(--font-size-11)] font-mono text-muted-foreground/70 truncate mt-0.5">
                        {m.id}
                      </p>
                    ) : null}
                    <ModelCapabilityBadges model={m} />
                  </div>
                  {m.contextWindow ? (
                    <span className="text-[length:var(--font-size-11)] text-muted-foreground shrink-0">
                      {m.contextWindow}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCustomModel(m.id);
                    }}
                  >
                    <XIcon className="size-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}

              {addingModel ? (
                <div className="space-y-2 border-t border-border/60 px-2 py-2">
                  <Input
                    className={cn(SETTINGS_FORM_INPUT_MONO, "w-full")}
                    placeholder={t("settings.editor.provider.modelIdPlaceholder")}
                    value={newModelId}
                    onChange={(e) => {
                      setNewModelId(e.target.value);
                      setAddModelError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCustomModel();
                      if (e.key === "Escape") setAddingModel(false);
                    }}
                    autoFocus
                  />
                  <Input
                    className={cn(SETTINGS_FORM_INPUT, "w-full")}
                    placeholder={t("settings.editor.provider.modelNamePlaceholder")}
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCustomModel();
                      if (e.key === "Escape") setAddingModel(false);
                    }}
                  />
                  <Input
                    className={cn(SETTINGS_FORM_INPUT, "w-full")}
                    placeholder={t("settings.editor.provider.contextPlaceholder")}
                    value={newModelContext}
                    onChange={(e) => setNewModelContext(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCustomModel();
                      if (e.key === "Escape") setAddingModel(false);
                    }}
                  />
                  <label className="flex items-center gap-2 text-[length:var(--font-size-12)] text-foreground">
                    <Checkbox
                      checked={newModelVision}
                      onCheckedChange={(checked) => setNewModelVision(Boolean(checked))}
                    />
                    {t("settings.editor.provider.vision")}
                  </label>
                  {addModelError ? (
                    <p className="text-[length:var(--font-size-11)] text-destructive">{addModelError}</p>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="xs" onClick={handleAddCustomModel}>
                      {t("settings.editor.provider.addModel")}
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setAddingModel(false)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  onClick={openAddModelForm}
                >
                  <PlusIcon className="size-3" />
                  {t("settings.editor.provider.addModelEllipsis")}
                </button>
              )}

              {allSelectedModels.length === 0 && !addingModel && presetModels.length === 0 && customModels.length === 0 ? (
                <p className="text-[length:var(--font-size-12)] text-muted-foreground text-center py-4">
                  {t("settings.editor.provider.noModels")}
                </p>
              ) : null}
            </div>
          </SettingsFormField>

          {saveError ? (
            <p className="text-[length:var(--font-size-12)] text-destructive">{saveError}</p>
          ) : null}
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button
            size="xs"
            onClick={() => void handleSave()}
            disabled={saving || allSelectedModels.length === 0}
          >
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isEditing ? t("common.save") : t("settings.slots.addProvider")}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel}>
            {t("common.cancel")}
          </Button>
          {isEditing ? (
            <>
              <span className="flex-1 min-w-[1rem]" />
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                {t("common.remove")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.editor.provider.removeTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.editor.provider.removeDesc", {
                name: existing?.name || t("settings.editor.provider.thisProvider"),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="shadow-none"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              onClick={removeProvider}
            >
              {t("common.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

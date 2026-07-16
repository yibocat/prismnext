import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  ChevronDownIcon,
  KeyRoundIcon,
  PlusIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALL_PROVIDERS,
  resolveProviderConfig,
  buildCustomModelEntry,
  modelIdTaken,
  getConfiguredVisionModels,
  modelSupportsVision,
  type ProviderConfig,
  type ModelConfig,
} from "@/lib/providers";
import { ModelCapabilityBadges } from "@/components/modules/chat/agent-settings/model-capability-badges";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const MODEL_ROW =
  "flex items-center justify-between gap-3 py-2 px-3 hover:bg-muted/40 transition-colors";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium tabular-nums shrink-0";

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
        label: t("settings.models.connected"),
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-600 dark:text-emerald-400",
      };
    case "failed":
      return {
        label: t("settings.models.connectionFailed"),
        dotClass: "bg-destructive",
        textClass: "text-destructive",
      };
    case "untested":
      return {
        label: t("settings.models.keySet"),
        dotClass: "bg-amber-500",
        textClass: "text-amber-600 dark:text-amber-400",
      };
    default:
      return {
        label: t("settings.models.noApiKey"),
        dotClass: "bg-muted-foreground/35",
        textClass: "text-muted-foreground",
      };
  }
}

function ConnectionStatusLine({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  const meta = connectionMeta(status, t);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[length:var(--font-size-11)]", meta.textClass)}>
      <span className={cn("size-1.5 rounded-full shrink-0", meta.dotClass)} />
      {meta.label}
    </span>
  );
}

export function ModelSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const customProviders = useSettingsStore((s) => s.settings.aiCustomProviders) || [];
  const visionCandidates = getConfiguredVisionModels(
    settings.aiEnabledModels,
    settings.aiCustomModelsData,
    customProviders,
    settings.aiApiKeys,
  );
  const selectedVisionFallback = settings.aiVisionFallbackModel ?? "__none__";
  const visionFallbackValid =
    selectedVisionFallback === "__none__" ||
    visionCandidates.some(
      ({ provider, model }) => `${provider.id}/${model.id}` === selectedVisionFallback,
    );
  const visionFallbackValue = visionFallbackValid ? selectedVisionFallback : "__none__";

  const openAddProvider = () => {
    openSettingsPanel({ kind: "ai-provider", mode: "new" });
  };

  const openEditProvider = (providerId: string) => {
    openSettingsPanel({ kind: "ai-provider", mode: "edit", providerId });
  };

  const openBuiltinKey = (providerId: string) => {
    openSettingsPanel({ kind: "ai-provider", mode: "builtin-key", providerId });
  };

  const builtInProviders = ALL_PROVIDERS.filter((p) => p.id !== "custom");

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.models.title")}</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {t("settings.models.subtitle")}
            </p>
          </div>
          <Button variant="outline" size="xs" className="shrink-0" onClick={openAddProvider}>
            <PlusIcon className="size-3 mr-1" />
            {t("settings.models.addProvider")}
          </Button>
        </div>

        <section>
          <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.models.multimodal")}</h3>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <p className={SETTINGS_ROW_LABEL}>{t("settings.models.multimodal")}</p>
                <p className={SETTINGS_ROW_DESC}>
                  {t("settings.models.multimodalDesc")}
                </p>
              </div>
              <AppSelect
                value={visionFallbackValue}
                onValueChange={(value) =>
                  void updateSettings({
                    aiVisionFallbackModel: value === "__none__" ? null : value,
                  })
                }
              >
                <AppSelectTrigger className="w-52 shrink-0">
                  <AppSelectValue placeholder={t("settings.models.none")} />
                </AppSelectTrigger>
                <AppSelectContent className="max-h-72">
                  <AppSelectItem value="__none__">{t("settings.models.none")}</AppSelectItem>
                  {visionCandidates.map(({ provider, model }) => (
                    <AppSelectItem
                      key={`${provider.id}/${model.id}`}
                      value={`${provider.id}/${model.id}`}
                    >
                      {provider.name} / {model.name}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
          {visionCandidates.length === 0 ? (
            <p className={cn(SETTINGS_ROW_DESC, "mt-1.5 text-amber-600 dark:text-amber-400")}>
              {t("settings.models.noVisionCandidates")}
            </p>
          ) : null}
          {!visionFallbackValid && selectedVisionFallback !== "__none__" ? (
            <p className={cn(SETTINGS_ROW_DESC, "mt-1.5 text-amber-600 dark:text-amber-400")}>
              {t("settings.models.visionInvalid")}
            </p>
          ) : null}
        </section>

        <section>
          <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.models.builtin")}</h3>
          <div className="space-y-2">
            {builtInProviders.map((provider) => (
              <ModelProviderCard
                key={provider.id}
                provider={provider}
                onConfigureBuiltin={() => openBuiltinKey(provider.id)}
              />
            ))}
          </div>
        </section>

        {customProviders.length > 0 ? (
          <section>
            <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.models.addedProviders")}</h3>
            <div className="space-y-2">
              {customProviders.map((provider) => (
                <ModelProviderCard
                  key={provider.id}
                  provider={
                    resolveProviderConfig(provider.id, customProviders) ?? {
                      id: provider.id,
                      name: provider.name,
                      defaultBaseUrl: provider.baseUrl,
                      models: [],
                    }
                  }
                  isCustom
                  onConfigure={() => openEditProvider(provider.id)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ModelProviderCard({
  provider,
  isCustom = false,
  onConfigure,
  onConfigureBuiltin,
}: {
  provider: ProviderConfig;
  isCustom?: boolean;
  onConfigure?: () => void;
  onConfigureBuiltin?: () => void;
}) {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const aiApiKeys = settings.aiApiKeys || {};
  const verifiedProviders = settings.aiVerifiedProviders || [];
  const customModelsData = (settings.aiCustomModelsData?.[provider.id] || []) as ModelConfig[];
  const enabledModels = settings.aiEnabledModels?.[provider.id];

  const apiKey = aiApiKeys[provider.id] || "";
  const isVerified = verifiedProviders.includes(provider.id);

  const [expanded, setExpanded] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newModelContext, setNewModelContext] = useState("");
  const [newModelVision, setNewModelVision] = useState(false);
  const [addModelError, setAddModelError] = useState<string | null>(null);

  const registryModels = provider.models || [];
  const customModelIds = customModelsData.map((m) => m.id);
  const enabledOrphanIds = (enabledModels || []).filter(
    (id) => !registryModels.some((m) => m.id === id) && !customModelIds.includes(id),
  );
  const allModelIds = [
    ...new Set([...registryModels.map((m) => m.id), ...customModelIds, ...enabledOrphanIds]),
  ];

  const connectionStatus: ConnectionStatus = !apiKey
    ? "none"
    : isVerified
      ? "verified"
      : "untested";

  const enabledCount = allModelIds.filter((id) =>
    enabledModels ? enabledModels.includes(id) : true,
  ).length;

  const getModel = (modelId: string): ModelConfig | undefined => {
    const staticModel = registryModels.find((m) => m.id === modelId);
    if (staticModel) return staticModel;
    return customModelsData.find((m) => m.id === modelId);
  };

  const visionCount = allModelIds.filter((id) => modelSupportsVision(getModel(id))).length;

  const isModelEnabled = (modelId: string) =>
    enabledModels ? enabledModels.includes(modelId) : true;

  const toggleModel = (modelId: string, enabled: boolean) => {
    const current = enabledModels || allModelIds;
    const next = enabled
      ? [...new Set([...current, modelId])]
      : current.filter((m) => m !== modelId);
    updateSettings({ aiEnabledModels: { ...settings.aiEnabledModels, [provider.id]: next } });
  };

  const setAllModelsEnabled = (enabled: boolean) => {
    updateSettings({
      aiEnabledModels: {
        ...settings.aiEnabledModels,
        [provider.id]: enabled ? [...allModelIds] : [],
      },
    });
  };

  const handleAddModel = () => {
    const modelId = newModelId.trim();
    if (!modelId) {
      setAddModelError("Model ID is required.");
      return;
    }
    if (modelIdTaken(modelId, registryModels, customModelsData)) {
      setAddModelError("This model ID is already listed.");
      return;
    }
    const newCustom = buildCustomModelEntry(modelId, newModelName, newModelContext, {
      vision: newModelVision,
    });
    updateSettings({
      aiCustomModelsData: {
        ...settings.aiCustomModelsData,
        [provider.id]: [...customModelsData, newCustom],
      },
      aiEnabledModels: {
        ...settings.aiEnabledModels,
        [provider.id]: [...(enabledModels || allModelIds), modelId],
      },
    });
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

  const toggleCustomModelVision = (modelId: string, vision: boolean) => {
    updateSettings({
      aiCustomModelsData: {
        ...settings.aiCustomModelsData,
        [provider.id]: customModelsData.map((m) =>
          m.id === modelId ? { ...m, capabilities: { ...m.capabilities, vision } } : m,
        ),
      },
    });
  };

  const openConfigure = () => {
    if (isCustom && onConfigure) {
      onConfigure();
      return;
    }
    onConfigureBuiltin?.();
  };

  const configureLabel = isCustom
    ? t("settings.models.configure")
    : apiKey
      ? t("settings.models.apiKey")
      : t("settings.models.apiKey");

  return (
    <div className={cn(SETTINGS_CARD, "!divide-y-0 !px-0 overflow-hidden")}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded ? "" : "-rotate-90",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className={SETTINGS_ROW_LABEL}>{provider.name}</p>
            <ConnectionStatusLine status={connectionStatus} />
          </div>
        </button>

        {allModelIds.length > 0 ? (
          <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
            {enabledCount}/{allModelIds.length} on
          </span>
        ) : null}
        {visionCount > 0 ? (
          <span className={cn(BADGE, "bg-primary/10 text-primary")}>{visionCount} vision</span>
        ) : null}

        <Button variant="outline" size="xs" className="shrink-0" onClick={openConfigure}>
          {isCustom ? (
            <Settings2Icon className="size-3 mr-1" />
          ) : (
            <KeyRoundIcon className="size-3 mr-1" />
          )}
          {configureLabel}
        </Button>
      </div>

      {expanded ? (
        <div className="border-t border-border">
          {allModelIds.length === 0 ? (
            <div className="px-3 py-4">
              <p className={SETTINGS_ROW_DESC}>
                {isCustom
                  ? "No models yet. Open Configure to add models and credentials."
                  : "No models listed for this provider."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
                <span className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/70">
                  Available models
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 text-[length:var(--font-size-11)] text-muted-foreground"
                    onClick={() => setAllModelsEnabled(true)}
                  >
                    Enable all
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 text-[length:var(--font-size-11)] text-muted-foreground"
                    onClick={() => setAllModelsEnabled(false)}
                  >
                    Disable all
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-border/60">
                {allModelIds.map((modelId) => {
                  const model = getModel(modelId);
                  const enabled = isModelEnabled(modelId);
                  const isUserModel = customModelIds.includes(modelId);

                  return (
                    <div key={modelId} className={MODEL_ROW}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={cn(
                              "text-[length:var(--font-size-13)] font-medium truncate",
                              enabled ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {model?.name || modelId}
                          </p>
                          <ModelCapabilityBadges model={model} />
                        </div>
                        {model?.name && model.name !== modelId ? (
                          <p className="text-[length:var(--font-size-11)] font-mono text-muted-foreground/70 truncate mt-0.5">
                            {modelId}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isUserModel ? (
                          <label
                            className="flex items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground"
                            title="Vision / image input"
                          >
                            <Checkbox
                              checked={modelSupportsVision(model)}
                              onCheckedChange={(checked) =>
                                toggleCustomModelVision(modelId, Boolean(checked))
                              }
                            />
                            Vision
                          </label>
                        ) : null}
                        {model?.contextWindow ? (
                          <span className="text-[length:var(--font-size-11)] text-muted-foreground tabular-nums">
                            {model.contextWindow}
                          </span>
                        ) : null}
                        {isUserModel ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive"
                            title="Remove model"
                            onClick={() =>
                              updateSettings({
                                aiCustomModelsData: {
                                  ...settings.aiCustomModelsData,
                                  [provider.id]: customModelsData.filter((m) => m.id !== modelId),
                                },
                                aiEnabledModels: {
                                  ...settings.aiEnabledModels,
                                  [provider.id]: (enabledModels || allModelIds).filter(
                                    (m) => m !== modelId,
                                  ),
                                },
                              })
                            }
                          >
                            <XIcon className="size-3" />
                          </Button>
                        ) : null}
                        <Switch
                          size="sm"
                          checked={enabled}
                          onCheckedChange={(checked) => toggleModel(modelId, checked)}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${model?.name || modelId}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {provider.id === "openrouter" ? (
                addingModel ? (
                  <div className="space-y-2 border-t border-border/60 px-3 py-3">
                    <Input
                      className="!h-7 !text-[length:var(--font-size-12)] font-mono w-full"
                      placeholder="Model ID e.g. provider/model-id"
                      value={newModelId}
                      onChange={(e) => {
                        setNewModelId(e.target.value);
                        setAddModelError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddModel();
                        if (e.key === "Escape") setAddingModel(false);
                      }}
                      autoFocus
                    />
                    <Input
                      className="!h-7 !text-[length:var(--font-size-12)] w-full"
                      placeholder="Display name (optional)"
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddModel();
                        if (e.key === "Escape") setAddingModel(false);
                      }}
                    />
                    <Input
                      className="!h-7 !text-[length:var(--font-size-12)] w-full"
                      placeholder="Context e.g. 200K (optional)"
                      value={newModelContext}
                      onChange={(e) => setNewModelContext(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddModel();
                        if (e.key === "Escape") setAddingModel(false);
                      }}
                    />
                    <label className="flex items-center gap-2 text-[length:var(--font-size-12)] text-foreground">
                      <Checkbox
                        checked={newModelVision}
                        onCheckedChange={(checked) => setNewModelVision(Boolean(checked))}
                      />
                      Vision / image input
                    </label>
                    {addModelError ? (
                      <p className="text-[length:var(--font-size-11)] text-destructive">{addModelError}</p>
                    ) : null}
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="xs" onClick={handleAddModel}>
                        Add
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setAddingModel(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(MODEL_ROW, "w-full border-t border-border/60 text-left")}
                    onClick={openAddModelForm}
                  >
                    <span className="flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors">
                      <PlusIcon className="size-3" />
                      Add custom model…
                    </span>
                  </button>
                )
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

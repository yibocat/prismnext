import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { Button } from "@/components/ui/button";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  ChevronDownIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveProviderConfig,
  getConfiguredVisionModels,
  modelSupportsVision,
  prefetchOpenCodeModelsCatalog,
  type ProviderConfig,
  type ModelConfig,
} from "@/lib/providers";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const MODEL_ROW =
  "flex items-center gap-2 py-1.5 px-3 hover:bg-muted transition-colors";
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
        dotClass: "bg-success",
        textClass: "text-success",
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
        dotClass: "bg-warning",
        textClass: "text-warning",
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
  const [catalogTick, setCatalogTick] = useState(0);

  useEffect(() => {
    void prefetchOpenCodeModelsCatalog().then((entries) => {
      if (entries) setCatalogTick((t) => t + 1);
    });
  }, []);
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
            <p className={cn(SETTINGS_ROW_DESC, "mt-1.5 text-warning")}>
              {t("settings.models.noVisionCandidates")}
            </p>
          ) : null}
          {!visionFallbackValid && selectedVisionFallback !== "__none__" ? (
            <p className={cn(SETTINGS_ROW_DESC, "mt-1.5 text-warning")}>
              {t("settings.models.visionInvalid")}
            </p>
          ) : null}
        </section>

        <section>
          <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.models.addedProviders")}</h3>
          {customProviders.length > 0 ? (
            <div className="space-y-2">
              {customProviders.map((provider) => (
                <ModelProviderCard
                  key={`${provider.id}-${catalogTick}`}
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
          ) : (
            <div className={cn(SETTINGS_CARD, "!divide-y-0 px-3 py-4")}>
              <p className={SETTINGS_ROW_DESC}>
                {t("settings.models.noProvidersYet", {
                  defaultValue:
                    "No providers yet. Add a provider, fetch its model catalog, and select models for chat.",
                })}
              </p>
              <Button variant="outline" size="xs" className="mt-3" onClick={openAddProvider}>
                <PlusIcon className="size-3 mr-1" />
                {t("settings.models.addProvider")}
              </Button>
            </div>
          )}
        </section>
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

  const aiApiKeys = settings.aiApiKeys || {};
  const verifiedProviders = settings.aiVerifiedProviders || [];
  const customModelsData = (settings.aiCustomModelsData?.[provider.id] || []) as ModelConfig[];
  const enabledModels = settings.aiEnabledModels?.[provider.id];

  const apiKey = aiApiKeys[provider.id] || "";
  const isVerified = verifiedProviders.includes(provider.id);

  const [expanded, setExpanded] = useState(false);

  const registryModels = provider.models || [];
  const customModelIds = customModelsData.map((m) => m.id);
  const enabledOrphanIds = (enabledModels || []).filter(
    (id) => !registryModels.some((m) => m.id === id) && !customModelIds.includes(id),
  );
  const allAvailableIds = [
    ...new Set([...registryModels.map((m) => m.id), ...customModelIds, ...enabledOrphanIds]),
  ];
  // Legacy: missing aiEnabledModels → treat all known models as selected.
  const selectedModelIds =
    enabledModels === undefined ? allAvailableIds : [...enabledModels];

  const connectionStatus: ConnectionStatus = !apiKey
    ? "none"
    : isVerified
      ? "verified"
      : "untested";

  const getModel = (modelId: string): ModelConfig | undefined => {
    const staticModel = registryModels.find((m) => m.id === modelId);
    if (staticModel) return staticModel;
    return customModelsData.find((m) => m.id === modelId);
  };

  const visionCount = selectedModelIds.filter((id) =>
    modelSupportsVision(getModel(id)),
  ).length;

  const openConfigure = () => {
    if (isCustom && onConfigure) {
      onConfigure();
      return;
    }
    onConfigureBuiltin?.();
  };

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

        {selectedModelIds.length > 0 ? (
          <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
            {t("settings.models.selectedBadge", {
              count: selectedModelIds.length,
              defaultValue: "{{count}} selected",
            })}
          </span>
        ) : null}
        {visionCount > 0 ? (
          <span className={cn(BADGE, "bg-accent text-accent-foreground")}>
            {t("settings.models.visionBadge", {
              count: visionCount,
              defaultValue: "{{count}} vision",
            })}
          </span>
        ) : null}

        <Button variant="outline" size="xs" className="shrink-0" onClick={openConfigure}>
          <Settings2Icon className="size-3 mr-1" />
          {t("settings.models.configure")}
        </Button>
      </div>

      {expanded ? (
        <div className="border-t border-border">
          {selectedModelIds.length === 0 ? (
            <div className="space-y-3 px-3 py-4">
              <p className={SETTINGS_ROW_DESC}>
                {t("settings.models.noSelectedModels", {
                  defaultValue:
                    "No models selected for chat. Open Configure to choose which models to use.",
                })}
              </p>
              <Button variant="outline" size="xs" onClick={openConfigure}>
                <Settings2Icon className="size-3 mr-1" />
                {t("settings.models.configure")}
              </Button>
            </div>
          ) : (
            <>
              <div className="border-b border-border/60 px-3 py-2">
                <span className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("settings.models.selectedModelsHeading", {
                    defaultValue: "Selected models",
                  })}
                </span>
              </div>

              <div>
                {selectedModelIds.map((modelId) => {
                  const model = getModel(modelId);
                  const vision = modelSupportsVision(model);
                  return (
                    <div key={modelId} className={MODEL_ROW} title={modelId}>
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        <span className="truncate text-[length:var(--font-size-12)] text-foreground">
                          {model?.name || modelId}
                        </span>
                        {vision ? (
                          <span className="shrink-0 text-[length:var(--font-size-10)] text-muted-foreground">
                            Vision
                          </span>
                        ) : null}
                      </div>
                      {model?.contextWindow ? (
                        <span className="shrink-0 tabular-nums text-[length:var(--font-size-11)] text-muted-foreground">
                          {model.contextWindow}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// src/renderer/components/modules/chat/agent-settings/model-select.tsx
import { useMemo } from "react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuLabel,
  AppMenuTrigger,
  appMenuFontClass,
} from "@/components/ui/app-menu";
import { useSettingsStore } from "@/stores/settings-store";
import {
  getModel,
  getAllEnabledModels,
  resolveProviderConfig,
  type ProviderConfig,
  type ModelConfig,
} from "@/lib/providers";
import { ChevronDownIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { COMPOSER_TOOLBAR_TRIGGER } from "../worktree-selector";

export function ModelSelect() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const aiProvider = settings.aiProvider || "anthropic";
  const aiModel = settings.aiModel;
  const enabledModels = settings.aiEnabledModels;
  const customModels = settings.aiCustomModelsData;
  const customProviders = settings.aiCustomProviders;

  const currentProvider = resolveProviderConfig(aiProvider, customProviders);
  const currentModelId = aiModel ?? currentProvider?.defaultModel ?? "";
  const currentModel = currentProvider
    ? getModel(aiProvider, currentModelId, customModels, customProviders)
    : undefined;

  const displayName = currentModel?.name || currentProvider?.name || "Select Model";

  const visible = useMemo(
    () => getAllEnabledModels(enabledModels, customModels, customProviders),
    [enabledModels, customModels, customProviders],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { provider: ProviderConfig; models: ModelConfig[] }>();
    for (const { provider, model } of visible) {
      const entry = map.get(provider.id);
      if (entry) {
        entry.models.push(model);
      } else {
        map.set(provider.id, { provider, models: [model] });
      }
    }
    return Array.from(map.values());
  }, [visible]);

  const isEmpty = grouped.length === 0;

  const handleSelect = (providerId: string, modelId: string) => {
    updateSettings({ aiProvider: providerId, aiModel: modelId });
  };

  return (
    <AppMenu>
      <Hint label="AI Model">
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(COMPOSER_TOOLBAR_TRIGGER, "max-w-56")}
          >
            <span className="truncate">{displayName}</span>
            <ChevronDownIcon className="size-3 shrink-0" />
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="min-w-[13rem] w-[min(20rem,calc(100vw-2rem))] max-h-72 overflow-y-auto">
        {isEmpty && (
          <p className={cn("px-2 py-3 text-center text-muted-foreground", appMenuFontClass)}>
            Enable models in Settings → AI&amp;APIs
          </p>
        )}

        <div className="max-h-72 overflow-y-auto flex flex-col gap-px">
          {grouped.map(({ provider, models }) => (
            <div key={provider.id}>
              <AppMenuLabel className="pt-1 normal-case tracking-normal text-[length:var(--font-size-11)]">
                {provider.name}
              </AppMenuLabel>
              {models.map((model) => {
                const isSelected =
                  aiProvider === provider.id &&
                  (aiModel === model.id ||
                    (!aiModel && provider.defaultModel === model.id));
                return (
                  <AppMenuCheckItem
                    key={`${provider.id}:${model.id}`}
                    selected={isSelected}
                    onClick={() => handleSelect(provider.id, model.id)}
                    trailing={
                      <span className="text-[length:var(--font-size-11)] text-muted-foreground/40">
                        {model.contextWindow}
                      </span>
                    }
                  >
                    {model.name}
                  </AppMenuCheckItem>
                );
              })}
            </div>
          ))}
        </div>
      </AppMenuContent>
    </AppMenu>
  );
}

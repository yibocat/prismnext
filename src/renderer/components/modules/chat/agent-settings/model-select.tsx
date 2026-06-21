// src/renderer/components/modules/chat/agent-settings/model-select.tsx
import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/stores/settings-store";
import {
  ALL_PROVIDERS,
  getProvider,
  getModel,
  getAllEnabledModels,
  type ProviderConfig,
  type ModelConfig,
} from "@/lib/providers";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

export function ModelSelect() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const aiProvider = settings.aiProvider || "anthropic";
  const aiModel = settings.aiModel;
  const enabledModels = settings.aiEnabledModels;
  const customModels = settings.aiCustomModelsData;

  const currentProvider = getProvider(aiProvider);
  const currentModelId = aiModel ?? currentProvider?.defaultModel ?? "";
  const currentModel = currentProvider
    ? getModel(aiProvider, currentModelId)
    : undefined;

  const displayName = currentModel?.name || currentProvider?.name || "Select Model";

  const visible = useMemo(
    () => getAllEnabledModels(enabledModels, customModels),
    [enabledModels, customModels],
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors max-w-56"
          title="AI Model"
        >
          <span className="truncate">{displayName}</span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[length:var(--font-chat-meta)]">
          Select Model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isEmpty && (
          <div className="px-2 py-4 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
            Enable models in Settings → AI&amp;APIs
          </div>
        )}

        <div className="max-h-72 overflow-y-auto">
        {grouped.map(({ provider, models }) => (
          <div key={provider.id}>
            <DropdownMenuLabel className="text-[length:var(--font-size-11)] text-muted-foreground/60 font-medium pt-1">
              {provider.name}
            </DropdownMenuLabel>
            {models.map((model) => {
              const isSelected =
                aiProvider === provider.id &&
                (aiModel === model.id ||
                  (!aiModel && provider.defaultModel === model.id));
              return (
                <DropdownMenuItem
                  key={`${provider.id}:${model.id}`}
                  onClick={() => handleSelect(provider.id, model.id)}
                >
                  <span className="flex-1 text-[length:var(--font-chat-meta)] truncate">
                    {model.name}
                  </span>
                  <span className="text-[length:var(--font-size-11)] text-muted-foreground/40 ml-2 shrink-0">
                    {model.contextWindow}
                  </span>
                  {isSelected && (
                    <CheckIcon className="size-3 shrink-0 ml-1" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

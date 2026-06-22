import { useMemo, useRef, useState, useEffect } from "react";
import { useSettingsStore, type AppSettings } from "@/stores/settings-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  getAllEnabledModels,
  getModel,
  getProvider,
  getPreset,
  type ModelConfig,
  type ProviderConfig,
} from "@/lib/providers";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, SparklesIcon } from "lucide-react";
import { modelPreferenceKey } from "./model-keys";
import { useModelMenuPlacement } from "./use-submenu-side";

interface ModelThoughtSelectProps {
  compact?: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getModelThoughtLevels(
  providerId: string,
  modelId: string,
): Array<{ value: string; label: string }> | null {
  const provider = getProvider(providerId) || getPreset(providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  const levels = model
    ? model.reasoning !== undefined
      ? model.reasoning
      : provider?.reasoning
    : provider?.reasoning;
  if (!levels || levels.length === 0) return null;
  return levels.map((r: string) => ({ value: r, label: capitalize(r) }));
}

export function ModelThoughtSelect({ compact }: ModelThoughtSelectProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { menuAlign, refreshPlacement } = useModelMenuPlacement(triggerRef);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    refreshPlacement();
    const onResize = () => refreshPlacement();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [menuOpen, refreshPlacement]);

  const aiProvider = settings.aiProvider || "anthropic";
  const aiModel = settings.aiModel;
  const enabledModels = settings.aiEnabledModels;
  const customModels = settings.aiCustomModelsData;
  const modelThoughtLevels = settings.aiModelThoughtLevels ?? {};

  const currentProvider = getProvider(aiProvider);
  const currentModelId = aiModel ?? currentProvider?.defaultModel ?? "";
  const currentModel = currentProvider
    ? getModel(aiProvider, currentModelId)
    : undefined;
  const currentKey = modelPreferenceKey(aiProvider, currentModelId);
  const currentThought = modelThoughtLevels[currentKey] ?? settings.thoughtLevel;

  const currentThoughtLabel = currentProvider
    ? getModelThoughtLevels(aiProvider, currentModelId)?.find(
        (l) => l.value === currentThought,
      )?.label
    : undefined;

  const displayName = currentModel?.name || currentProvider?.name || "Select model";
  const triggerDetail =
    currentThoughtLabel && currentThoughtLabel !== "Default"
      ? `${displayName} · ${currentThoughtLabel}`
      : displayName;

  const visible = useMemo(
    () => getAllEnabledModels(enabledModels, customModels),
    [enabledModels, customModels],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { provider: ProviderConfig; models: ModelConfig[] }>();
    for (const { provider, model } of visible) {
      const entry = map.get(provider.id);
      if (entry) entry.models.push(model);
      else map.set(provider.id, { provider, models: [model] });
    }
    return Array.from(map.values());
  }, [visible]);

  const isEmpty = grouped.length === 0;

  const handleSelectModel = (providerId: string, modelId: string, levelValue?: string) => {
    const key = modelPreferenceKey(providerId, modelId);
    const activeLevel = levelValue ?? modelThoughtLevels[key];
    updateSettings({
      aiProvider: providerId,
      aiModel: modelId,
      thoughtLevel: activeLevel,
    });
  };

  const handleSelectThought = (key: string, providerId: string, levelValue: string | undefined) => {
    const next = { ...modelThoughtLevels };
    if (levelValue) next[key] = levelValue;
    else delete next[key];

    const patch: Partial<AppSettings> = {
      aiModelThoughtLevels: next,
    };

    if (modelPreferenceKey(aiProvider, currentModelId) === key) {
      patch.thoughtLevel = levelValue;
    }

    updateSettings(patch);
  };

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) refreshPlacement();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-w-0 outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
            compact ? "size-7 justify-center px-0 max-w-none" : "max-w-56",
          )}
          title={triggerDetail}
        >
          {compact ? (
            <SparklesIcon className="size-3.5 shrink-0" />
          ) : (
            <>
              <span className="truncate">{triggerDetail}</span>
              <ChevronDownIcon className="size-3 shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={menuAlign}
        side="top"
        sideOffset={6}
        collisionPadding={16}
        className={cn(
          "w-44 max-h-80 overflow-y-auto",
          compact && "max-w-[min(11rem,calc(100vw-2rem))]",
        )}
      >
        <DropdownMenuLabel className="text-[length:var(--font-chat-meta)] px-2 py-1.5">
          Select Model
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="-mx-1 my-1" />

        {isEmpty && (
          <div className="px-2 py-4 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
            Enable models in Settings → AI&amp;APIs
          </div>
        )}

        {grouped.map(({ provider, models }) => (
          <div key={provider.id}>
            <DropdownMenuLabel className="text-[length:var(--font-size-11)] text-muted-foreground/60 font-medium pt-2 pb-0.5 px-2">
              {provider.name}
            </DropdownMenuLabel>
            {models.map((model) => {
              const key = modelPreferenceKey(provider.id, model.id);
              const isSelected =
                aiProvider === provider.id &&
                (aiModel === model.id ||
                  (!aiModel && provider.defaultModel === model.id));
              const savedThought = modelThoughtLevels[key];
              const levels = getModelThoughtLevels(provider.id, model.id);

              if (levels && levels.length > 0) {
                const currentModelThoughtLabel = savedThought
                  ? levels.find((l) => l.value === savedThought)?.label
                  : null;

                return (
                  <DropdownMenuSub key={key}>
                    <DropdownMenuSubTrigger
                      className={cn(
                        "flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-left text-[length:var(--font-chat-meta)] focus:bg-accent",
                        isSelected && "bg-accent/40 font-medium",
                      )}
                      onClick={() => handleSelectModel(provider.id, model.id)}
                    >
                      <span className="flex-1 truncate">{model.name}</span>
                      {currentModelThoughtLabel && (
                        <span className="text-[length:var(--font-size-10)] text-muted-foreground/60 mr-1 shrink-0">
                          {currentModelThoughtLabel}
                        </span>
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent
                        collisionPadding={16}
                        className="w-28 p-1"
                      >
                        <DropdownMenuLabel className="text-[length:var(--font-size-11)] text-muted-foreground/60 font-medium px-2 py-1">
                          Reasoning Depth
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="-mx-1 my-1" />
                        <DropdownMenuItem
                          className="flex items-center gap-2 py-1 px-2 text-[length:var(--font-chat-meta)] rounded-sm"
                          onSelect={(e) => {
                            e.preventDefault();
                            handleSelectThought(key, provider.id, undefined);
                            handleSelectModel(provider.id, model.id, undefined);
                          }}
                        >
                          <span className="flex-1">Default</span>
                          {!savedThought && <CheckIcon className="size-3 shrink-0 ml-1" />}
                        </DropdownMenuItem>
                        {levels.map((level) => (
                          <DropdownMenuItem
                            key={level.value}
                            className="flex items-center gap-2 py-1 px-2 text-[length:var(--font-chat-meta)] rounded-sm"
                            onSelect={(e) => {
                              e.preventDefault();
                              handleSelectThought(key, provider.id, level.value);
                              handleSelectModel(provider.id, model.id, level.value);
                            }}
                          >
                            <span className="flex-1">{level.label}</span>
                            {savedThought === level.value && (
                              <CheckIcon className="size-3 shrink-0 ml-1" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                );
              }

              return (
                <DropdownMenuItem
                  key={key}
                  className={cn(
                    "flex items-center gap-1 py-1.5 px-2 text-[length:var(--font-chat-meta)] rounded-sm",
                    isSelected && "bg-accent/40 font-medium",
                  )}
                  onSelect={() => handleSelectModel(provider.id, model.id)}
                >
                  <span className="flex-1 truncate">{model.name}</span>
                  {isSelected && <CheckIcon className="size-3 shrink-0 ml-1" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

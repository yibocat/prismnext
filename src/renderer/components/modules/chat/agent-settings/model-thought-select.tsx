import { useMemo, useRef, useState, useEffect } from "react";
import { useSettingsStore, type AppSettings } from "@/stores/settings-store";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuSub,
  AppMenuSubContent,
  AppMenuSubTrigger,
  AppMenuTrigger,
  appMenuFontClass,
} from "@/components/ui/app-menu";
import { DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import {
  getAllEnabledModels,
  getModel,
  getProvider,
  getPreset,
  type ModelConfig,
  type ProviderConfig,
} from "@/lib/providers";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { modelPreferenceKey } from "./model-keys";
import { useModelMenuPlacement } from "./use-submenu-side";

interface ModelThoughtSelectProps {
  compact?: boolean;
  /** Capsule AiBar: model label + chevron to the left of send. */
  presentation?: "default" | "icon" | "capsule";
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

export function ModelThoughtSelect({ compact, presentation = "default" }: ModelThoughtSelectProps) {
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
  const useIconTrigger = presentation === "icon" || (presentation === "default" && compact);
  const useCapsuleTrigger = presentation === "capsule";

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
    <AppMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) refreshPlacement();
      }}
    >
      <AppMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "flex items-center gap-0.5 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-w-0 outline-hidden focus-visible:ring-1 focus-visible:ring-ring shrink-0",
            useIconTrigger && "size-7 justify-center px-0 max-w-none",
            useCapsuleTrigger && "max-w-[9rem] px-1",
            !useIconTrigger && !useCapsuleTrigger && "max-w-56",
          )}
          title={triggerDetail}
        >
          {useIconTrigger ? (
            <SparklesIcon className="size-3.5 shrink-0" />
          ) : (
            <>
              <span className="truncate">
                {useCapsuleTrigger ? displayName : triggerDetail}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </>
          )}
        </button>
      </AppMenuTrigger>
      <AppMenuContent
        align={menuAlign}
        side="top"
        sideOffset={6}
        collisionPadding={16}
        className={cn(
          "w-44 max-h-80 overflow-y-auto",
          (compact || useCapsuleTrigger) && "max-w-[min(11rem,calc(100vw-2rem))]",
        )}
      >
        <AppMenuLabel>Select Model</AppMenuLabel>
        <AppMenuSeparator />

        {isEmpty && (
          <p className={cn("px-2 py-3 text-center text-muted-foreground", appMenuFontClass)}>
            Enable models in Settings → AI&amp;APIs
          </p>
        )}

        {grouped.map(({ provider, models }) => (
          <div key={provider.id}>
            <AppMenuLabel className="pt-1 normal-case tracking-normal text-[length:var(--font-size-11)]">
              {provider.name}
            </AppMenuLabel>
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
                  <AppMenuSub key={key}>
                    <AppMenuSubTrigger
                      className={cn(isSelected && "font-medium")}
                      onClick={() => handleSelectModel(provider.id, model.id)}
                      trailing={
                        currentModelThoughtLabel ? (
                          <span className="text-[length:var(--font-size-10)] text-muted-foreground/60">
                            {currentModelThoughtLabel}
                          </span>
                        ) : null
                      }
                    >
                      {model.name}
                    </AppMenuSubTrigger>
                    <DropdownMenuPortal>
                      <AppMenuSubContent className="min-w-[7rem]">
                        <AppMenuLabel className="normal-case tracking-normal text-[length:var(--font-size-11)]">
                          Reasoning Depth
                        </AppMenuLabel>
                        <AppMenuSeparator />
                        <AppMenuCheckItem
                          selected={!savedThought}
                          onSelect={(e) => {
                            e.preventDefault();
                            handleSelectThought(key, provider.id, undefined);
                            handleSelectModel(provider.id, model.id, undefined);
                          }}
                        >
                          Default
                        </AppMenuCheckItem>
                        {levels.map((level) => (
                          <AppMenuCheckItem
                            key={level.value}
                            selected={savedThought === level.value}
                            onSelect={(e) => {
                              e.preventDefault();
                              handleSelectThought(key, provider.id, level.value);
                              handleSelectModel(provider.id, model.id, level.value);
                            }}
                          >
                            {level.label}
                          </AppMenuCheckItem>
                        ))}
                      </AppMenuSubContent>
                    </DropdownMenuPortal>
                  </AppMenuSub>
                );
              }

              return (
                <AppMenuCheckItem
                  key={key}
                  selected={isSelected}
                  className={cn(isSelected && "font-medium")}
                  onSelect={() => handleSelectModel(provider.id, model.id)}
                >
                  {model.name}
                </AppMenuCheckItem>
              );
            })}
          </div>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSidePanel,
  AppMenuTrigger,
  appMenuFontClass,
  appMenuInlineChevronTriggerClass,
  appMenuItemClass,
  appMenuNestedFocusHandlers,
} from "@/components/ui/app-menu";
import {
  getAllEnabledModels,
  getModel,
  getProvider,
  getPreset,
  type ModelConfig,
  type ProviderConfig,
} from "@/lib/providers";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronRightIcon, SparklesIcon } from "lucide-react";
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

/** Reasoning depth side panel — same nested AppMenu + SidePanel pattern as @ paper options. */
function ModelReasoningOptionsMenu({
  open,
  onOpenChange,
  levels,
  savedThought,
  onSelectLevel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levels: Array<{ value: string; label: string }>;
  savedThought?: string;
  onSelectLevel: (levelValue: string | undefined) => void;
}) {
  return (
    <AppMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <AppMenuTrigger asChild>
        <button
          type="button"
          data-reasoning-menu-trigger
          className={appMenuInlineChevronTriggerClass}
          aria-label="Reasoning depth"
          aria-expanded={open}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ChevronRightIcon className="size-3.5 opacity-70" />
        </button>
      </AppMenuTrigger>
      <AppMenuSidePanel className="min-w-[8.5rem]">
        <AppMenuLabel className="normal-case tracking-normal text-[length:var(--font-size-11)]">
          Reasoning Depth
        </AppMenuLabel>
        <AppMenuCheckItem
          selected={!savedThought}
          onSelect={(e) => {
            e.preventDefault();
            onSelectLevel(undefined);
            onOpenChange(false);
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
              onSelectLevel(level.value);
              onOpenChange(false);
            }}
          >
            {level.label}
          </AppMenuCheckItem>
        ))}
      </AppMenuSidePanel>
    </AppMenu>
  );
}

export function ModelThoughtSelect({ compact, presentation = "default" }: ModelThoughtSelectProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { menuAlign, refreshPlacement } = useModelMenuPlacement(triggerRef);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reasoningOpenKey, setReasoningOpenKey] = useState<string | null>(null);

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

  /** Reasoning depth pick — levelValue may be undefined (Default); must not fall back to saved level. */
  const handleSelectModelWithThought = (
    providerId: string,
    modelId: string,
    levelValue: string | undefined,
  ) => {
    const key = modelPreferenceKey(providerId, modelId);
    const next = { ...modelThoughtLevels };
    if (levelValue) next[key] = levelValue;
    else delete next[key];

    updateSettings({
      aiProvider: providerId,
      aiModel: modelId,
      aiModelThoughtLevels: next,
      thoughtLevel: levelValue,
    });
  };

  return (
    <AppMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) setReasoningOpenKey(null);
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
        className="min-w-[13rem] w-[min(20rem,calc(100vw-2rem))] max-h-80 overflow-y-auto"
        {...appMenuNestedFocusHandlers}
      >
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
                const thoughtLabelNode = currentModelThoughtLabel ? (
                  <span className="text-[length:var(--font-size-10)] text-muted-foreground/60">
                    {currentModelThoughtLabel}
                  </span>
                ) : null;

                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      appMenuItemClass,
                      "flex w-full items-center gap-1.5 text-left",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "font-medium text-foreground",
                    )}
                    onMouseDown={(e) => {
                      if ((e.target as HTMLElement).closest("[data-reasoning-menu-trigger]")) {
                        return;
                      }
                      e.preventDefault();
                      handleSelectModel(provider.id, model.id);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{model.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {thoughtLabelNode}
                      <ModelReasoningOptionsMenu
                        open={reasoningOpenKey === key}
                        onOpenChange={(open) => setReasoningOpenKey(open ? key : null)}
                        levels={levels}
                        savedThought={savedThought}
                        onSelectLevel={(levelValue) => {
                          handleSelectModelWithThought(provider.id, model.id, levelValue);
                          setReasoningOpenKey(null);
                          setMenuOpen(false);
                        }}
                      />
                    </span>
                  </button>
                );
              }

              return (
                <AppMenuItem
                  key={key}
                  className={cn(isSelected && "font-medium text-foreground")}
                  onSelect={() => {
                    handleSelectModel(provider.id, model.id);
                    setMenuOpen(false);
                  }}
                >
                  {model.name}
                </AppMenuItem>
              );
            })}
          </div>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}

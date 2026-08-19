import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { occupancyExceedsWindow } from "@shared/agent-context-usage";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuTrigger,
  appMenuFontClass,
  appMenuInputClass,
  appMenuItemClass,
  appMenuNestedFocusHandlers,
} from "@/components/ui/app-menu";
import {
  getAllEnabledModels,
  getModel,
  getModelEffortLevels,
  effortLevelsFromCatalogEntry,
  prefetchEffortCatalog,
  prefetchPiModelsCatalog,
  modelSupportsVision,
  resolveProviderConfig,
  resolveSelectedModelContextTokensIfKnown,
  type ModelConfig,
  type ProviderConfig,
} from "@/lib/providers";
import { modelEffortKey } from "../../../../../shared/pi-provider-catalog";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, Settings2Icon, SparklesIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { i18n } from "@/lib/i18n";
import { modelPreferenceKey } from "./model-keys";
import {
  useModelMenuPlacement,
  MODEL_MENU_MIN_WIDTH,
  estimateContentWidthFromLabels,
  measureMenuTextWidth,
  resolveMenuMeasureFont,
  shouldWrapModelMenuNames,
  placeModelHoverInfoStyle,
  placeModelEditPanelStyle,
} from "./use-submenu-side";
import { COMPOSER_TOOLBAR_TRIGGER } from "../worktree-selector";
import { useLayoutStore } from "@/stores/layout-store";
import { pressLeftNav } from "@/lib/workspace/left-nav";
import { getLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";
import {
  MODEL_PICKER_EVENT,
  setModelPickerOpenState,
  type ModelPickerEventDetail,
} from "@/lib/chat/open-model-picker";

interface ModelThoughtSelectProps {
  compact?: boolean;
  /** Capsule AiBar: model label + chevron to the left of send. */
  presentation?: "default" | "icon" | "capsule";
}

type ModelEntry = { provider: ProviderConfig; model: ModelConfig; key: string };

/** Debounce clearing hover so the info panel does not flicker on tiny mouse moves. */
const HOVER_CLEAR_MS = 120;

function isModelEditPanelTarget(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest("[data-model-edit-panel]");
}

/**
 * Browser focus often scrolls the active row to the middle of the list — feels like a jump.
 * Re-apply only the minimal scroll needed to keep the row visible (nearest edge).
 */
function scrollMenuItemNearest(scroller: HTMLElement, item: HTMLElement) {
  const itemRect = item.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const pad = 2;
  if (itemRect.bottom > scrollerRect.bottom - pad) {
    scroller.scrollTop += itemRect.bottom - scrollerRect.bottom + pad;
  } else if (itemRect.top < scrollerRect.top + pad) {
    scroller.scrollTop -= scrollerRect.top - itemRect.top + pad;
  }
}

function isModelMenuArrowNavKey(key: string): boolean {
  return (
    key === "ArrowDown"
    || key === "ArrowUp"
    || key === "Home"
    || key === "End"
    || key === "PageDown"
    || key === "PageUp"
  );
}

/** @deprecated Prefer `getModelEffortLevels` from `@/lib/providers`. */
export function getModelThoughtLevels(
  providerId: string,
  modelId: string,
): Array<{ value: string; label: string }> | null {
  return getModelEffortLevels(providerId, modelId);
}

/**
 * Hover blurb priority:
 * 1. Optional i18n `chat.model.desc.<provider>.<model>` (curated translations)
 * 2. Pi catalog `description` (rare — Pi catalog usually omits it)
 * 3. Generic context / output-token fallback built from Pi metadata
 */
function resolveModelDescription(entry: ModelEntry): string {
  const { model, provider } = entry;
  const key = `chat.model.desc.${provider.id}.${model.id}`;
  if (i18n.exists(key)) return i18n.t(key);

  if (model.description?.trim()) return model.description.trim();

  const generic = i18n.t("chat.model.descFallback", {
    provider: provider.name,
    context: model.contextWindow,
    defaultValue: `${provider.name} model with ${model.contextWindow} context.`,
  });
  const suffix = modelSupportsVision(model)
    ? i18n.t("chat.model.descVisionSuffix", {
        defaultValue: " Supports image input.",
      })
    : "";
  if (!model.maxTokens) return generic + suffix;
  return (
    generic
    + i18n.t("chat.model.descMaxOutputSuffix", {
      size: model.maxTokens,
      defaultValue: ` Up to ${model.maxTokens} output tokens.`,
    })
    + suffix
  );
}

function resolveThoughtLabel(
  levels: Array<{ value: string; label: string }> | null | undefined,
  savedThought?: string,
): string | null {
  if (!savedThought || !levels?.length) return null;
  return levels.find((l) => l.value === savedThought)?.label ?? null;
}

function filterEntries(entries: ModelEntry[], query: string): ModelEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    ({ model, provider }) =>
      model.name.toLowerCase().includes(q)
      || model.id.toLowerCase().includes(q)
      || provider.name.toLowerCase().includes(q),
  );
}

function groupByProvider(entries: ModelEntry[]): Array<{ provider: ProviderConfig; models: ModelEntry[] }> {
  const map = new Map<string, { provider: ProviderConfig; models: ModelEntry[] }>();
  for (const entry of entries) {
    const existing = map.get(entry.provider.id);
    if (existing) existing.models.push(entry);
    else map.set(entry.provider.id, { provider: entry.provider, models: [entry] });
  }
  return Array.from(map.values());
}

/** Hover-only info card — plain DOM portal (not MenuItem). */
/** Format a per-1M-token USD price: "$0.15" / "$2.75" / "$1.05". */
function formatModelPrice(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `$${value.toFixed(2).replace(/\.?0+$/, "")}`;
}

function ModelInfoPanel({
  entry,
  anchor,
  avoidMenu,
  thoughtLabel,
}: {
  entry: ModelEntry;
  anchor: DOMRect;
  /** Model dropdown content rect — keep the card outside this box when narrow. */
  avoidMenu: DOMRect | null;
  thoughtLabel?: string | null;
}) {
  const { t } = useTranslation();
  const { model } = entry;
  const cost = model.cost;
  const hasCost = cost && (cost.input != null || cost.output != null);
  const priceInput = hasCost ? formatModelPrice(cost.input) : null;
  const priceOutput = hasCost ? formatModelPrice(cost.output) : null;
  return createPortal(
    <div
      style={placeModelHoverInfoStyle(anchor, avoidMenu)}
      className={cn(
        "pointer-events-none box-border max-h-[min(12rem,40vh)] max-w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-border bg-popover p-3 shadow-md",
        appMenuFontClass,
      )}
    >
      <p className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
        {model.name}
      </p>
      <p className="mt-1.5 min-w-0 line-clamp-4 break-words text-[length:var(--font-size-11)] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
        {resolveModelDescription(entry)}
      </p>
      <p className="mt-2 min-w-0 break-words text-[length:var(--font-size-10)] text-muted-foreground/80 [overflow-wrap:anywhere]">
        {t("chat.model.contextWindow", { size: model.contextWindow })}
        {model.maxTokens
          ? ` · ${t("chat.model.maxOutput", { size: model.maxTokens })}`
          : ""}
      </p>
      {hasCost ? (
        <p className="mt-1 min-w-0 break-words text-[length:var(--font-size-10)] text-muted-foreground/80 [overflow-wrap:anywhere]">
          {t("chat.model.pricePerM", {
            input: priceInput ?? "—",
            output: priceOutput ?? "—",
          })}
        </p>
      ) : null}
      {thoughtLabel ? (
        <p className="mt-1 min-w-0 break-words text-[length:var(--font-size-10)] italic text-muted-foreground/70 [overflow-wrap:anywhere]">
          {t("chat.model.reasoningDepth")}: {thoughtLabel}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}

/**
 * Reasoning Edit — plain portal (not nested AppMenu).
 * Nested DropdownMenu inside the picker was closing immediately on open.
 * Keyboard: ↑/↓ move, Enter confirm, Esc close (opened from model row via →).
 */
function ModelEditPanel({
  anchor,
  avoidMenu,
  levels,
  savedThought,
  onSelectLevel,
  onClose,
}: {
  anchor: DOMRect;
  avoidMenu: DOMRect | null;
  levels: Array<{ value: string; label: string }>;
  savedThought?: string;
  onSelectLevel: (levelValue: string | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const options = useMemo(
    () => [
      { value: undefined as string | undefined, label: t("chat.model.default") },
      ...levels.map((l) => ({ value: l.value as string | undefined, label: l.label })),
    ],
    [levels, t],
  );

  const initialIndex = Math.max(
    0,
    options.findIndex((o) =>
      savedThought ? o.value === savedThought : o.value === undefined,
    ),
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSelectLevel(options[activeIndexRef.current]?.value);
        return;
      }
    };
    const onPointer = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-model-edit-panel]") || el?.closest("[data-model-row-action]")) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose, onSelectLevel, options]);

  return createPortal(
    <div
      data-model-edit-panel
      role="listbox"
      aria-label={t("chat.model.reasoningDepth")}
      style={placeModelEditPanelStyle(anchor, avoidMenu)}
      className={cn(
        "max-h-[min(14rem,45vh)] overflow-auto rounded-md border border-border bg-popover p-1 shadow-md",
        appMenuFontClass,
      )}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="px-2 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide text-muted-foreground">
        {t("chat.model.reasoningDepth")}
      </p>
      {options.map((opt, index) => {
        const selected = savedThought
          ? opt.value === savedThought
          : opt.value === undefined;
        const active = index === activeIndex;
        return (
          <button
            key={opt.value ?? "__default__"}
            type="button"
            role="option"
            aria-selected={selected}
            className={cn(
              appMenuItemClass,
              "flex w-full items-center justify-between text-left",
              "hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent text-accent-foreground",
            )}
            onMouseEnter={() => setActiveIndex(index)}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectLevel(opt.value);
            }}
          >
            <span>{opt.label}</span>
            {selected ? <CheckIcon className="size-3.5 opacity-80" /> : null}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export function ModelThoughtSelect({ compact, presentation = "default" }: ModelThoughtSelectProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const menuBodyRef = useRef<HTMLDivElement>(null);
  /** Snapshot scrollTop before ↑/↓ so we can undo browser center-scroll. */
  const arrowNavScrollTopRef = useRef<number | null>(null);
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { menuAlign, menuWidth, refreshPlacement } = useModelMenuPlacement(triggerRef);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoverEntry, setHoverEntry] = useState<ModelEntry | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const [hoverMenuRect, setHoverMenuRect] = useState<DOMRect | null>(null);
  const [editOpenKey, setEditOpenKey] = useState<string | null>(null);
  const [editAnchor, setEditAnchor] = useState<DOMRect | null>(null);
  const [effortCatalogMap, setEffortCatalogMap] = useState<Record<string, string[]>>({});
  const [catalogTick, setCatalogTick] = useState(0);
  /** Longest row label width (before panel clamp) — used to decide wrap vs widen. */
  const [neededMenuWidth, setNeededMenuWidth] = useState(MODEL_MENU_MIN_WIDTH);

  const openEdit = useCallback((key: string, anchor: DOMRect) => {
    if (hoverClearTimer.current) {
      clearTimeout(hoverClearTimer.current);
      hoverClearTimer.current = null;
    }
    setHoverEntry(null);
    setHoverAnchor(null);
    setHoverMenuRect(null);
    setEditOpenKey(key);
    setEditAnchor(anchor);
  }, []);

  const closeEdit = useCallback(() => {
    const key = editOpenKey;
    setEditOpenKey(null);
    setEditAnchor(null);
    if (!key) return;
    requestAnimationFrame(() => {
      menuBodyRef.current
        ?.querySelector<HTMLElement>(`[data-model-row-key="${CSS.escape(key)}"]`)
        ?.focus();
    });
  }, [editOpenKey]);

  const clearHoverSoon = useCallback(() => {
    if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current);
    hoverClearTimer.current = setTimeout(() => {
      setHoverEntry(null);
      setHoverAnchor(null);
      setHoverMenuRect(null);
      hoverClearTimer.current = null;
    }, HOVER_CLEAR_MS);
  }, []);

  const setHoverNow = useCallback((entry: ModelEntry, anchor: DOMRect) => {
    if (hoverClearTimer.current) {
      clearTimeout(hoverClearTimer.current);
      hoverClearTimer.current = null;
    }
    setHoverEntry(entry);
    setHoverAnchor(anchor);
    setHoverMenuRect(menuContentRef.current?.getBoundingClientRect() ?? null);
  }, []);

  const aiProvider = settings.aiProvider || "anthropic";
  const aiModel = settings.aiModel;
  const enabledModels = settings.aiEnabledModels;
  const customModels = settings.aiCustomModelsData;
  const customProviders = settings.aiCustomProviders;
  const modelThoughtLevels = settings.aiModelThoughtLevels ?? {};

  useEffect(() => {
    let cancelled = false;
    void prefetchEffortCatalog().then((entries) => {
      if (!cancelled && entries) setEffortCatalogMap(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void prefetchPiModelsCatalog().then((entries) => {
      if (!cancelled && entries) setCatalogTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    let cancelled = false;
    void prefetchEffortCatalog().then((entries) => {
      if (!cancelled && entries) setEffortCatalogMap(entries);
    });
    void prefetchPiModelsCatalog().then((entries) => {
      if (!cancelled && entries) setCatalogTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [menuOpen]);

  const resolveLevels = useCallback(
    (providerId: string, modelId: string) =>
      effortLevelsFromCatalogEntry(
        effortCatalogMap[modelEffortKey(providerId, modelId)],
        providerId,
        modelId,
        customModels,
        customProviders,
      ),
    [effortCatalogMap, customModels, customProviders],
  );

  useEffect(() => {
    if (!menuOpen) {
      setSearchQuery("");
      setHoverEntry(null);
      setHoverAnchor(null);
      setHoverMenuRect(null);
      setEditOpenKey(null);
      setEditAnchor(null);
      if (hoverClearTimer.current) {
        clearTimeout(hoverClearTimer.current);
        hoverClearTimer.current = null;
      }
    }
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current);
    };
  }, []);

  const currentProvider = resolveProviderConfig(aiProvider, customProviders);
  const currentModelId = aiModel ?? currentProvider?.defaultModel ?? "";
  const currentModel = currentProvider
    ? getModel(aiProvider, currentModelId, customModels, customProviders)
    : undefined;
  const currentKey = modelPreferenceKey(aiProvider, currentModelId);
  const currentThought = modelThoughtLevels[currentKey] ?? settings.thoughtLevel;

  const currentThoughtLabel = currentProvider
    ? resolveLevels(aiProvider, currentModelId)?.find(
        (l) => l.value === currentThought,
      )?.label
    : undefined;

  const defaultLabel = t("chat.model.default");
  const displayName = currentModel?.name || currentProvider?.name || t("chat.model.selectModel");
  const triggerDetail =
    currentThoughtLabel && currentThoughtLabel !== "Default" && currentThoughtLabel !== defaultLabel
      ? `${displayName} · ${currentThoughtLabel}`
      : displayName;

  const entries = useMemo(() => {
    void catalogTick;
    return getAllEnabledModels(enabledModels, customModels, customProviders).map(
      ({ provider, model }) => ({
        provider,
        model,
        key: modelPreferenceKey(provider.id, model.id),
      }),
    );
  }, [enabledModels, customModels, customProviders, catalogTick]);

  const filtered = useMemo(
    () => filterEntries(entries, searchQuery),
    [entries, searchQuery],
  );

  useEffect(() => {
    setModelPickerOpenState(menuOpen);
    return () => {
      setModelPickerOpenState(false);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onPickerEvent = (e: Event) => {
      const mode = (e as CustomEvent<ModelPickerEventDetail>).detail?.mode ?? "open";
      if (mode === "close") {
        setMenuOpen(false);
        return;
      }
      setMenuOpen(true);
      requestAnimationFrame(() => refreshPlacement());
    };
    window.addEventListener(MODEL_PICKER_EVENT, onPickerEvent);
    return () => window.removeEventListener(MODEL_PICKER_EVENT, onPickerEvent);
  }, [refreshPlacement]);

  useEffect(() => {
    if (!menuOpen) return;
    const font = resolveMenuMeasureFont(triggerRef.current);
    const labels = filtered.map((entry) => {
      const levels = resolveLevels(entry.provider.id, entry.model.id);
      const thought = resolveThoughtLabel(
        levels,
        modelThoughtLevels[entry.key],
      );
      return thought ? `${entry.model.name} ${thought}` : entry.model.name;
    });
    const contentWidth = estimateContentWidthFromLabels(labels, (text) =>
      measureMenuTextWidth(text, font),
    );
    setNeededMenuWidth(contentWidth);
    refreshPlacement(contentWidth);
    const onResize = () => refreshPlacement();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [
    menuOpen,
    filtered,
    refreshPlacement,
    resolveLevels,
    modelThoughtLevels,
  ]);

  const wrapName = shouldWrapModelMenuNames(menuWidth, neededMenuWidth);

  const grouped = useMemo(() => groupByProvider(filtered), [filtered]);

  const isEmpty = entries.length === 0;
  const useIconTrigger = presentation === "icon" || (presentation === "default" && compact);
  const useCapsuleTrigger = presentation === "capsule";
  const searching = searchQuery.trim().length > 0;

  const warnIfOccupancyExceeds = useCallback(
    (providerId: string, modelId: string) => {
      const sameModel = providerId === aiProvider && modelId === currentModelId;
      if (sameModel) return;
      const windowSize = resolveSelectedModelContextTokensIfKnown(
        providerId,
        modelId,
        enabledModels,
        customModels,
        customProviders,
      );
      if (windowSize == null) return;
      const occupancy = useChatStore.getState().contextTokens;
      if (!occupancyExceedsWindow(occupancy, windowSize)) return;
      toast.warning(t("chat.context.windowExceeds"));
    },
    [aiProvider, currentModelId, enabledModels, customModels, customProviders, t],
  );

  const handleSelectModel = useCallback(
    (providerId: string, modelId: string, levelValue?: string) => {
      const key = modelPreferenceKey(providerId, modelId);
      const activeLevel = levelValue ?? modelThoughtLevels[key];
      warnIfOccupancyExceeds(providerId, modelId);
      updateSettings({
        aiProvider: providerId,
        aiModel: modelId,
        thoughtLevel: activeLevel,
      });
    },
    [modelThoughtLevels, updateSettings, warnIfOccupancyExceeds],
  );

  const handleSelectModelWithThought = useCallback(
    (providerId: string, modelId: string, levelValue: string | undefined) => {
      const key = modelPreferenceKey(providerId, modelId);
      const next = { ...modelThoughtLevels };
      if (levelValue) next[key] = levelValue;
      else delete next[key];

      warnIfOccupancyExceeds(providerId, modelId);
      updateSettings({
        aiProvider: providerId,
        aiModel: modelId,
        aiModelThoughtLevels: next,
        thoughtLevel: levelValue,
      });
    },
    [modelThoughtLevels, updateSettings, warnIfOccupancyExceeds],
  );

  const renderRow = (entry: ModelEntry) => {
    const { provider, model, key } = entry;
    const isSelected =
      aiProvider === provider.id
      && (aiModel === model.id || (!aiModel && provider.defaultModel === model.id));
    const savedThought = modelThoughtLevels[key];
    const levels = resolveLevels(provider.id, model.id);
    const thoughtLabel = resolveThoughtLabel(levels, savedThought);
    const editOpen = editOpenKey === key;
    const hasLevels = !!levels && levels.length > 0;

    const nameTitle = thoughtLabel ? `${model.name} ${thoughtLabel}` : model.name;

    return (
      <AppMenuItem
        key={key}
        data-model-row-key={key}
        className={cn(
          "group flex w-full gap-1.5",
          wrapName ? "items-start" : "items-center",
          isSelected && "font-medium text-foreground",
        )}
        onSelect={(e) => {
          if ((e.target as HTMLElement).closest("[data-model-row-action]")) {
            e.preventDefault();
            return;
          }
          if (editOpenKey) {
            e.preventDefault();
            return;
          }
          handleSelectModel(provider.id, model.id);
          setMenuOpen(false);
        }}
        onKeyDown={(e) => {
          if (!hasLevels) return;
          if (e.key !== "ArrowRight") return;
          e.preventDefault();
          e.stopPropagation();
          openEdit(key, e.currentTarget.getBoundingClientRect());
        }}
        onMouseEnter={(e) => {
          if (editOpenKey) return;
          setHoverNow(entry, e.currentTarget.getBoundingClientRect());
        }}
        onMouseLeave={() => {
          if (editOpen) return;
          clearHoverSoon();
        }}
      >
        <span
          className={cn(
            "min-w-0 flex-1",
            wrapName
              ? "line-clamp-2 break-words leading-snug [overflow-wrap:anywhere]"
              : "truncate",
          )}
          title={nameTitle}
        >
          <span>{model.name}</span>
          {thoughtLabel ? (
            <span className="text-muted-foreground/60"> {thoughtLabel}</span>
          ) : null}
        </span>

        <span
          className={cn(
            "relative ml-auto flex h-5 shrink-0 items-center justify-end",
            hasLevels ? "w-10" : "w-4",
            wrapName && "mt-0.5",
          )}
        >
          {isSelected && !editOpen ? (
            <CheckIcon
              className="size-3.5 text-foreground/80 group-hover:opacity-0 group-focus:opacity-0 group-data-[highlighted]:opacity-0"
              aria-hidden
            />
          ) : null}
          {hasLevels ? (
            <span
              className={cn(
                "absolute inset-y-0 right-0 flex items-center",
                "opacity-0 group-hover:opacity-100 group-focus:opacity-100 group-data-[highlighted]:opacity-100",
                editOpen && "opacity-100",
              )}
            >
              <button
                type="button"
                data-model-row-action
                className={cn(
                  "rounded-sm px-1 py-0.5 text-[length:var(--font-size-10)]",
                  "text-muted-foreground hover:text-foreground",
                  "outline-none border-0 bg-transparent",
                )}
                aria-label={t("chat.model.edit")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editOpen) {
                    closeEdit();
                    return;
                  }
                  const row = (e.currentTarget as HTMLElement).closest("[role='menuitem']");
                  openEdit(
                    key,
                    (row ?? e.currentTarget).getBoundingClientRect(),
                  );
                }}
              >
                {t("chat.model.edit")}
              </button>
            </span>
          ) : null}
        </span>
      </AppMenuItem>
    );
  };

  return (
    <>
      <AppMenu
        modal={false}
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) {
            setEditOpenKey(null);
            setEditAnchor(null);
            setHoverEntry(null);
            setHoverAnchor(null);
            setHoverMenuRect(null);
          }
          if (open) refreshPlacement();
        }}
      >
        <Hint label={triggerDetail} shortcutId="product.openModelPicker">
          <AppMenuTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              className={cn(
                COMPOSER_TOOLBAR_TRIGGER,
                useIconTrigger && "size-6 justify-center px-0 max-w-none",
                // Grow with the label; truncate only when the bar/panel is truly tight.
                useCapsuleTrigger && "max-w-[min(22rem,calc(100cqw-7.5rem))]",
                !useIconTrigger && !useCapsuleTrigger && "max-w-[min(20rem,calc(100cqw-4rem))]",
              )}
            >
              {useIconTrigger ? (
                <SparklesIcon className="size-3 shrink-0" />
              ) : (
                <>
                  <span className="min-w-0 truncate">
                    {triggerDetail}
                  </span>
                  <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
                </>
              )}
            </button>
          </AppMenuTrigger>
        </Hint>
        <AppMenuContent
          ref={menuContentRef}
          align={menuAlign}
          side="top"
          sideOffset={6}
          collisionPadding={16}
          style={{ width: menuWidth }}
          // Keep AppMenu chrome (p-0.5 / gap-0.5). Scroll the panel itself so the
          // scrollbar sits on the border — not an inner scroller inside the padding.
          className="min-w-0 w-auto max-w-none max-h-[min(24rem,calc(100vh-6rem))] overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none]"
          onPointerDownOutside={(e) => {
            if (editOpenKey && isModelEditPanelTarget(e.target)) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (editOpenKey && isModelEditPanelTarget(e.target)) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => {
            if (editOpenKey && isModelEditPanelTarget(e.target)) {
              e.preventDefault();
            }
          }}
          onOpenAutoFocus={(e) => {
            // Focus first model row so ↑/↓ work — do not focus search.
            e.preventDefault();
            requestAnimationFrame(() => {
              const first = menuBodyRef.current?.querySelector<HTMLElement>(
                '[data-slot="dropdown-menu-item"]',
              );
              first?.focus({ preventScroll: true });
            });
          }}
          onKeyDownCapture={(e) => {
            // Capture before Radix moves focus — save scroll to undo center-jumps.
            if (!isModelMenuArrowNavKey(e.key)) return;
            const scroller = menuContentRef.current;
            if (!scroller) return;
            arrowNavScrollTopRef.current = scroller.scrollTop;
          }}
          onFocusCapture={(e) => {
            const scroller = menuContentRef.current;
            const locked = arrowNavScrollTopRef.current;
            arrowNavScrollTopRef.current = null;
            if (scroller == null || locked == null) return;
            const item = (e.target as HTMLElement | null)?.closest?.(
              '[data-slot="dropdown-menu-item"]',
            ) as HTMLElement | null;
            if (!item || !scroller.contains(item)) return;
            scroller.scrollTop = locked;
            scrollMenuItemNearest(scroller, item);
          }}
          onCloseAutoFocus={appMenuNestedFocusHandlers.onCloseAutoFocus}
        >
          <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-border/50 bg-popover px-1.5 py-0.5">
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("chat.model.searchModels")}
              className={cn(
                appMenuInputClass,
                "h-6 min-w-0 flex-1 px-0",
                "placeholder:text-muted-foreground/40",
                "caret-foreground",
              )}
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <Hint label={t("chat.model.openSettingsModels")}>
              <button
                type="button"
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-sm",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                aria-label={t("chat.model.openSettingsModels")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  useLayoutStore.getState().setSettingsCategory("models");
                  pressLeftNav("settings", { panelRefs: getLeftNavPanelRefs() });
                }}
              >
                <Settings2Icon className="size-3.5" />
              </button>
            </Hint>
          </div>

          <div ref={menuBodyRef}>
            {isEmpty && (
              <p className={cn("px-2 py-3 text-center text-muted-foreground", appMenuFontClass)}>
                Enable models in Settings → AI&amp;APIs
              </p>
            )}

            {!isEmpty && searching && filtered.length === 0 && (
              <p className={cn("px-2 py-3 text-center text-muted-foreground", appMenuFontClass)}>
                —
              </p>
            )}

            {grouped.map(({ provider, models }, groupIndex) => (
              <div key={provider.id} className={cn(groupIndex > 0 && "mt-0.5")}>
                <AppMenuLabel className="px-2 py-1 text-[length:var(--font-size-10)] uppercase tracking-wide text-muted-foreground/70">
                  {provider.name}
                </AppMenuLabel>
                {models.map(renderRow)}
              </div>
            ))}
          </div>
        </AppMenuContent>
      </AppMenu>

      {hoverEntry && hoverAnchor && !editOpenKey ? (
        <ModelInfoPanel
          entry={hoverEntry}
          anchor={hoverAnchor}
          avoidMenu={hoverMenuRect}
          thoughtLabel={resolveThoughtLabel(
            resolveLevels(hoverEntry.provider.id, hoverEntry.model.id),
            modelThoughtLevels[hoverEntry.key],
          )}
        />
      ) : null}

      {editOpenKey && editAnchor ? (() => {
        const entry = entries.find((e) => e.key === editOpenKey);
        if (!entry) return null;
        const levels = resolveLevels(entry.provider.id, entry.model.id);
        if (!levels?.length) return null;
        return (
          <ModelEditPanel
            anchor={editAnchor}
            avoidMenu={menuContentRef.current?.getBoundingClientRect() ?? hoverMenuRect}
            levels={levels}
            savedThought={modelThoughtLevels[editOpenKey]}
            onClose={closeEdit}
            onSelectLevel={(levelValue) => {
              handleSelectModelWithThought(
                entry.provider.id,
                entry.model.id,
                levelValue,
              );
              closeEdit();
              setMenuOpen(false);
            }}
          />
        );
      })() : null}
    </>
  );
}

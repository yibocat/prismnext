import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AppSelect,
  AppSelectContent,
  AppSelectGroup,
  AppSelectItem,
  AppSelectLabel,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { useSettingsStore } from "@/stores/settings-store";
import { getAllEnabledModels, getModelEffortLevelsAsync, resolveProviderConfig, type CustomProviderEntry, type ModelConfig } from "@/lib/providers";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_FORM_INPUT,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";
import { SettingsModulePromptPreview } from "./settings-module-prompt-preview";
import { MARKDOWN_TOOLBAR_TEXT_BTN } from "@/components/modules/editor/toolbars/markdown-toolbar";
import { formatTokenCount } from "@shared/token-estimate";
import { Hint } from "@/components/ui/hint";

const CARD_GRID = "grid grid-cols-1 @lg:grid-cols-2 gap-2";
const SELECT_LIST = "rounded-lg border border-border divide-y divide-border/60 overflow-hidden";
const SELECTABLE_CARD =
  "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
const SELECTABLE_ROW =
  "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset";
const CARD_TITLE = "text-[length:var(--font-size-13)] font-medium leading-snug";
const CARD_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-1 line-clamp-2";
const SELECT_LIST_PAGE_SIZE = 12;
const CARD_GRID_PAGE_SIZE = 8;

export function CollapsibleFormSection({
  title,
  summary,
  defaultOpen = false,
  /** When false, no outer card chrome — only children (e.g. a content preview) should be framed. */
  framed = true,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  framed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn(framed && "rounded-lg border border-border overflow-hidden")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-left transition-colors",
          framed ? "px-3 py-2.5 hover:bg-muted/40" : "py-1",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[length:var(--font-size-13)] font-medium">{title}</span>
          {summary ? (
            <span className="block text-[length:var(--font-size-11)] text-muted-foreground mt-0.5 truncate">
              {summary}
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className={cn(framed ? "border-t border-border/60 px-3 py-3" : "pt-2")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface ProfileFormState {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  modelProvider: string;
  modelId: string;
  thoughtLevel: string;
}

export function emptyProfileForm(): ProfileFormState {
  return {
    name: "",
    description: "",
    instructions: "",
    modelProvider: "",
    modelId: "",
    thoughtLevel: "",
  };
}

export function parseProfileModel(model?: string): { providerId: string; modelId: string } {
  if (!model?.includes("/")) return { providerId: "", modelId: "" };
  const slash = model.indexOf("/");
  return { providerId: model.slice(0, slash), modelId: model.slice(slash + 1) };
}

export function formatProfileModel(providerId: string, modelId: string): string | undefined {
  if (!providerId.trim() || !modelId.trim()) return undefined;
  return `${providerId}/${modelId}`;
}

function SelectableCard({
  title,
  description,
  selected,
  disabled,
  onToggle,
}: {
  title: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        SELECTABLE_CARD,
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        disabled && "opacity-60 cursor-default",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          disabled={disabled}
          className="mt-0.5 pointer-events-none"
          tabIndex={-1}
        />
        <div className="min-w-0 text-left">
          <p className={CARD_TITLE}>{title}</p>
          {description ? <p className={CARD_DESC}>{description}</p> : null}
        </div>
      </div>
    </button>
  );
}

function SelectableListRow({
  title,
  description,
  selected,
  disabled,
  onToggle,
}: {
  title: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(SELECTABLE_ROW, selected && "bg-primary/5", disabled && "opacity-60 cursor-default")}
    >
      <Checkbox
        checked={selected}
        disabled={disabled}
        className="mt-0.5 pointer-events-none shrink-0"
        tabIndex={-1}
      />
      <div className="min-w-0 flex-1 text-left">
        <p className={CARD_TITLE}>{title}</p>
        {description ? <p className={CARD_DESC}>{description}</p> : null}
      </div>
    </button>
  );
}

function PaginatedSelectableList({
  items,
  selectedIds,
  disabled,
  onToggle,
  pageSize = SELECT_LIST_PAGE_SIZE,
}: {
  items: { id: string; title: string; description?: string }[];
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
  pageSize?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const itemsKey = items.map((item) => item.id).join("\0");

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [itemsKey, pageSize]);

  const orderedItems = useMemo(() => {
    const selected = items.filter((item) => selectedSet.has(item.id));
    const rest = items.filter((item) => !selectedSet.has(item.id));
    return [...selected, ...rest];
  }, [items, selectedSet]);

  const visibleItems = orderedItems.slice(0, visibleCount);
  const remaining = orderedItems.length - visibleItems.length;

  return (
    <div className="space-y-2">
      <div className={SELECT_LIST}>
        {visibleItems.map((item) => (
          <SelectableListRow
            key={item.id}
            title={item.title}
            description={item.description}
            selected={selectedSet.has(item.id)}
            disabled={disabled}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </div>
      {remaining > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="w-full text-muted-foreground"
          disabled={disabled}
          onClick={() => setVisibleCount((count) => count + pageSize)}
        >
          Load more ({remaining} remaining)
        </Button>
      ) : null}
    </div>
  );
}

function PaginatedSelectableCardGrid({
  items,
  selectedIds,
  disabled,
  onToggle,
  pageSize = CARD_GRID_PAGE_SIZE,
}: {
  items: { id: string; title: string; description?: string }[];
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
  pageSize?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const itemsKey = items.map((item) => item.id).join("\0");

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [itemsKey, pageSize]);

  const orderedItems = useMemo(() => {
    const selected = items.filter((item) => selectedSet.has(item.id));
    const rest = items.filter((item) => !selectedSet.has(item.id));
    return [...selected, ...rest];
  }, [items, selectedSet]);

  const visibleItems = orderedItems.slice(0, visibleCount);
  const remaining = orderedItems.length - visibleItems.length;

  return (
    <div className="space-y-2">
      <div className={CARD_GRID}>
        {visibleItems.map((item) => (
          <SelectableCard
            key={item.id}
            title={item.title}
            description={item.description}
            selected={selectedSet.has(item.id)}
            disabled={disabled}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </div>
      {remaining > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="w-full text-muted-foreground"
          disabled={disabled}
          onClick={() => setVisibleCount((count) => count + pageSize)}
        >
          Load more ({remaining} remaining)
        </Button>
      ) : null}
    </div>
  );
}

export function ProfileEditorForm({
  form,
  onFormChange,
  builtinCustomize = false,
  saving = false,
  /** When false, hide the model / reasoning controls (lead agents use Composer model). */
  showModel = true,
  /** Initial instructions pane — use "source" when creating so the user can type immediately. */
  initialInstructionsView = "preview",
}: {
  form: ProfileFormState;
  onFormChange: (next: ProfileFormState) => void;
  builtinCustomize?: boolean;
  saving?: boolean;
  showModel?: boolean;
  initialInstructionsView?: "source" | "preview";
}) {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const enabledModels = useMemo(
    () =>
      getAllEnabledModels(
        settings.aiEnabledModels,
        settings.aiCustomModelsData,
        settings.aiCustomProviders,
      ),
    [settings.aiEnabledModels, settings.aiCustomModelsData, settings.aiCustomProviders],
  );

  const modelGroups = useMemo(() => {
    const map = new Map<string, typeof enabledModels>();
    for (const entry of enabledModels) {
      const list = map.get(entry.provider.id) ?? [];
      list.push(entry);
      map.set(entry.provider.id, list);
    }
    return map;
  }, [enabledModels]);

  const modelValue =
    form.modelProvider && form.modelId ? `${form.modelProvider}::${form.modelId}` : "";

  const [thoughtLevels, setThoughtLevels] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    if (!form.modelProvider) {
      setThoughtLevels([]);
      return;
    }
    let cancelled = false;
    void getModelEffortLevelsAsync(
      form.modelProvider,
      form.modelId,
      settings.aiCustomModelsData,
      settings.aiCustomProviders,
    ).then((levels) => {
      if (!cancelled) setThoughtLevels(levels ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [
    form.modelProvider,
    form.modelId,
    settings.aiCustomModelsData,
    settings.aiCustomProviders,
  ]);

  useEffect(() => {
    if (
      !form.modelProvider
      || !form.thoughtLevel
      || thoughtLevels.length === 0
      || thoughtLevels.some((l) => l.value === form.thoughtLevel)
    ) {
      return;
    }
    onFormChange({ ...form, thoughtLevel: "" });
  }, [thoughtLevels, form, onFormChange]);

  const patch = (partial: Partial<ProfileFormState>) => onFormChange({ ...form, ...partial });
  const lockIdentity = builtinCustomize;
  const lockInstructions = builtinCustomize;
  const [instructionsView, setInstructionsView] = useState<"source" | "preview">(initialInstructionsView);
  const [instructionTokenCount, setInstructionTokenCount] = useState<number | null>(null);

  useEffect(() => {
    const text = form.instructions;
    if (!text.trim()) {
      setInstructionTokenCount(0);
      return;
    }
    const timer = window.setTimeout(() => {
      void window.electronAPI.settingsCountPromptTokens(text).then((result) => {
        setInstructionTokenCount(result.tokenCount);
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [form.instructions]);

  return (
    <div className="@container space-y-8">
      <div className={SETTINGS_DETAIL_SECTION}>
        <SettingsFormField label={t("settings.agent.profileForm.name")} htmlFor="profile-name">
          <Input
            id="profile-name"
            className={SETTINGS_FORM_INPUT}
            placeholder={t("settings.agent.profileForm.namePlaceholder")}
            value={form.name}
            readOnly={lockIdentity}
            disabled={lockIdentity}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </SettingsFormField>
        <SettingsFormField
          label={t("settings.agent.profileForm.description")}
          htmlFor="profile-description"
          description={t("settings.agent.profileForm.descriptionDesc")}
        >
          <Input
            id="profile-description"
            className={SETTINGS_FORM_INPUT}
            placeholder={t("settings.agent.profileForm.descriptionPlaceholder")}
            value={form.description}
            readOnly={lockIdentity}
            disabled={lockIdentity}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </SettingsFormField>
      </div>

      {showModel ? (
        <div>
          <h3 className="text-[length:var(--font-size-12)] font-medium mb-1">
            {t("settings.agent.profileForm.model")}
          </h3>
          <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
            {t("settings.agent.profileForm.modelDesc")}
          </p>
          <div className="flex flex-wrap gap-3">
            <AppSelect
              disabled={saving}
              value={modelValue || "__default__"}
              onValueChange={(v) => {
                if (v === "__default__") {
                  patch({ modelProvider: "", modelId: "", thoughtLevel: "" });
                  return;
                }
                const [providerId, modelId] = v.split("::");
                patch({
                  modelProvider: providerId,
                  modelId,
                  thoughtLevel: "",
                });
              }}
            >
              <AppSelectTrigger variant="dialog" className="w-full min-w-[min(320px,100%)]">
                <AppSelectValue placeholder={t("settings.agent.profileForm.chatDefault")} />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="__default__">
                  {t("settings.agent.profileForm.chatDefault")}
                </AppSelectItem>
                {Array.from(modelGroups.entries()).map(([providerId, entries]) => (
                  <AppSelectGroup key={providerId}>
                    <AppSelectLabel>{entries[0]?.provider.name ?? providerId}</AppSelectLabel>
                    {entries.map(({ model }) => (
                      <AppSelectItem
                        key={`${providerId}::${model.id}`}
                        value={`${providerId}::${model.id}`}
                      >
                        {model.name}
                      </AppSelectItem>
                    ))}
                  </AppSelectGroup>
                ))}
              </AppSelectContent>
            </AppSelect>

            {form.modelProvider && thoughtLevels.length > 0 ? (
              <AppSelect
                disabled={saving}
                value={form.thoughtLevel || "__default__"}
                onValueChange={(v) => patch({ thoughtLevel: v === "__default__" ? "" : v })}
              >
                <AppSelectTrigger variant="dialog" className="w-full min-w-[min(180px,100%)]">
                  <AppSelectValue placeholder={t("settings.agent.profileForm.reasoningDepth")} />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="__default__">
                    {t("settings.agent.profileForm.defaultDepth")}
                  </AppSelectItem>
                  {thoughtLevels.map((l) => (
                    <AppSelectItem key={l.value} value={l.value}>
                      {l.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className={cn("mb-3", !lockInstructions && "flex items-start justify-between gap-3")}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className={cn(SETTINGS_CATEGORY_HEADER, "mb-0")}>
                {t("settings.agent.profileForm.instructions")}
              </h3>
              {instructionTokenCount != null ? (
                <span className="text-[length:var(--font-size-11)] text-muted-foreground/80 tabular-nums leading-none">
                  {t("settings.editor.promptStack.tokens", {
                    count: formatTokenCount(instructionTokenCount),
                  })}
                </span>
              ) : null}
            </div>
            <p className={SETTINGS_ROW_DESC}>{t("settings.agent.profileForm.instructionsDesc")}</p>
          </div>
          {!lockInstructions ? (
            <div className="flex shrink-0 items-center gap-0.5 select-none">
              <Hint label={t("settings.agent.profileForm.instructionsPreview")}>
                <button
                  type="button"
                  className={cn(
                    MARKDOWN_TOOLBAR_TEXT_BTN,
                    instructionsView === "preview" && "text-foreground font-medium",
                  )}
                  onClick={() => setInstructionsView("preview")}
                >
                  {t("settings.agent.profileForm.instructionsPreview")}
                </button>
              </Hint>
              <Hint label={t("settings.agent.profileForm.instructionsSource")}>
                <button
                  type="button"
                  className={cn(
                    MARKDOWN_TOOLBAR_TEXT_BTN,
                    instructionsView === "source" && "text-foreground font-medium",
                  )}
                  onClick={() => setInstructionsView("source")}
                >
                  {t("settings.agent.profileForm.instructionsSource")}
                </button>
              </Hint>
            </div>
          ) : null}
        </div>
        {lockInstructions || instructionsView === "preview" ? (
          form.instructions.trim() ? (
            <SettingsModulePromptPreview content={form.instructions} />
          ) : (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              {t("settings.agent.profileForm.instructionsEmpty")}
            </p>
          )
        ) : (
          <Textarea
            value={form.instructions}
            placeholder={t("settings.agent.profileForm.instructionsPlaceholder")}
            className={cn(
              SETTINGS_FORM_TEXTAREA,
              "min-h-[12rem] max-h-[28rem] font-mono text-[length:var(--font-size-12)]",
            )}
            onChange={(e) => patch({ instructions: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

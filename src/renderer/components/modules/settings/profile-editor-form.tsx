import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { getAllEnabledModels, getModel, resolveProviderConfig, type CustomProviderEntry, type ModelConfig } from "@/lib/providers";
import { cn } from "@/lib/utils";
import type { AgentEditorOptions } from "@shared/agent-editor-options";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_FORM_INPUT,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";

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

function selectionSummary(
  selected: number,
  total: number,
  emptyLabel: string,
  t: TFunction,
): string {
  if (total === 0) return t("settings.agent.profileForm.noneAvailable");
  if (selected === 0) return emptyLabel;
  return t("settings.agent.profileForm.selectedCount", { count: selected });
}

export function CollapsibleFormSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
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
      {open ? <div className="border-t border-border/60 px-3 py-3">{children}</div> : null}
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
  skills: string[];
  mcpServers: string[];
  modules: string[];
  rules: string[];
}

export function emptyProfileForm(): ProfileFormState {
  return {
    name: "",
    description: "",
    instructions: "",
    modelProvider: "",
    modelId: "",
    thoughtLevel: "",
    skills: [],
    mcpServers: [],
    modules: [],
    rules: [],
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

function toggleItem(list: string[], item: string, on: boolean): string[] {
  if (on) return list.includes(item) ? list : [...list, item];
  return list.filter((v) => v !== item);
}

function getThoughtLevelsForModel(
  providerId: string,
  modelId: string,
  customModels?: Record<string, ModelConfig[]>,
  customProviders?: CustomProviderEntry[],
) {
  const model = modelId ? getModel(providerId, modelId, customModels, customProviders) : undefined;
  const provider = resolveProviderConfig(providerId, customProviders);
  const levels = model?.reasoning ?? provider?.reasoning;
  const resolved = levels ?? ["low", "medium", "high"];
  return resolved.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));
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
  editorOptions,
  builtinCustomize = false,
  saving = false,
}: {
  form: ProfileFormState;
  onFormChange: (next: ProfileFormState) => void;
  editorOptions: AgentEditorOptions | null;
  builtinCustomize?: boolean;
  saving?: boolean;
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

  const thoughtLevels = form.modelProvider
    ? getThoughtLevelsForModel(
        form.modelProvider,
        form.modelId,
        settings.aiCustomModelsData,
        settings.aiCustomProviders,
      )
    : [];

  const patch = (partial: Partial<ProfileFormState>) => onFormChange({ ...form, ...partial });
  const lockIdentity = builtinCustomize;
  const lockInstructions = builtinCustomize;

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

      <div>
        <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.agent.profileForm.model")}</h3>
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
              const levels = getThoughtLevelsForModel(
                providerId,
                modelId,
                settings.aiCustomModelsData,
                settings.aiCustomProviders,
              );
              patch({
                modelProvider: providerId,
                modelId,
                thoughtLevel: levels.some((l) => l.value === form.thoughtLevel)
                  ? form.thoughtLevel
                  : "",
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

      <div>
        <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.agent.profileForm.instructions")}</h3>
        <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
          {t("settings.agent.profileForm.instructionsDesc")}
        </p>
        <Textarea
          value={form.instructions}
          readOnly={lockInstructions}
          disabled={lockInstructions}
          placeholder={t("settings.agent.profileForm.instructionsPlaceholder")}
          className={cn(SETTINGS_FORM_TEXTAREA, lockInstructions && "opacity-80")}
          onChange={(e) => patch({ instructions: e.target.value })}
        />
      </div>

      {editorOptions ? (
        <div className="space-y-2">
          {(() => {
            const profileModules = editorOptions.modules;
            return (
              <CollapsibleFormSection
                title={t("settings.agent.profileForm.knowledgeModules")}
                summary={selectionSummary(
                  form.modules.length,
                  profileModules.length,
                  t("settings.agent.profileForm.noneSelected"),
                  t,
                )}
                defaultOpen={form.modules.length > 0}
              >
                <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
                  {t("settings.agent.profileForm.knowledgeDesc")}
                </p>
                <p className={cn(SETTINGS_ROW_DESC, "mb-3 text-muted-foreground")}>
                  {t("settings.agent.profileForm.knowledgeDiscipline")}
                </p>
                {profileModules.length === 0 ? (
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    {t("settings.agent.profileForm.noModules")}
                  </p>
                ) : (
                  <PaginatedSelectableCardGrid
                    items={profileModules.map((mod) => ({
                      id: mod.key,
                      title: mod.label,
                      description: mod.description,
                    }))}
                    selectedIds={form.modules}
                    disabled={saving}
                    onToggle={(id) =>
                      patch({
                        modules: toggleItem(form.modules, id, !form.modules.includes(id)),
                      })
                    }
                  />
                )}
              </CollapsibleFormSection>
            );
          })()}

          <CollapsibleFormSection
            title={t("settings.agent.profileForm.skills")}
            summary={selectionSummary(
              form.skills.length,
              editorOptions.skills.length,
              t("settings.agent.profileForm.allSkills"),
              t,
            )}
            defaultOpen={form.skills.length > 0}
          >
            <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
              {t("settings.agent.profileForm.skillsDesc")}
            </p>
            {editorOptions.skills.length === 0 ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                {t("settings.agent.profileForm.noSkills")}
              </p>
            ) : (
              <PaginatedSelectableList
                items={editorOptions.skills.map((skill) => ({
                  id: skill.id,
                  title: skill.name || skill.id,
                  description: skill.description,
                }))}
                selectedIds={form.skills}
                disabled={saving}
                onToggle={(id) =>
                  patch({
                    skills: toggleItem(form.skills, id, !form.skills.includes(id)),
                  })
                }
              />
            )}
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title={t("settings.agent.profileForm.mcpServers")}
            summary={selectionSummary(
              form.mcpServers.length,
              editorOptions.mcpServers.length,
              t("settings.agent.profileForm.allServers"),
              t,
            )}
            defaultOpen={form.mcpServers.length > 0}
          >
            <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
              {t("settings.agent.profileForm.mcpDesc")}
            </p>
            {editorOptions.mcpServers.length === 0 ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                {t("settings.agent.profileForm.noMcp")}
              </p>
            ) : (
              <div className={SELECT_LIST}>
                {editorOptions.mcpServers.map((srv) => (
                  <SelectableListRow
                    key={srv.name}
                    title={srv.name}
                    selected={form.mcpServers.includes(srv.name)}
                    disabled={saving}
                    onToggle={() =>
                      patch({
                        mcpServers: toggleItem(
                          form.mcpServers,
                          srv.name,
                          !form.mcpServers.includes(srv.name),
                        ),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title={t("settings.agent.profileForm.rules")}
            summary={selectionSummary(
              form.rules.length,
              editorOptions.rules.length,
              t("settings.agent.profileForm.allRules"),
              t,
            )}
            defaultOpen={form.rules.length > 0}
          >
            <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
              {t("settings.agent.profileForm.rulesDesc")}
            </p>
            {editorOptions.rules.length === 0 ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                {t("settings.agent.profileForm.noRules")}
              </p>
            ) : (
              <div className={SELECT_LIST}>
                {editorOptions.rules.map((rule) => (
                  <SelectableListRow
                    key={rule.name}
                    title={rule.name}
                    selected={form.rules.includes(rule.name)}
                    disabled={saving}
                    onToggle={() =>
                      patch({
                        rules: toggleItem(
                          form.rules,
                          rule.name,
                          !form.rules.includes(rule.name),
                        ),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </CollapsibleFormSection>
        </div>
      ) : null}
    </div>
  );
}

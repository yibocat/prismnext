import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { getAllEnabledModels, getModel, getProvider } from "@/lib/providers";
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

function selectionSummary(selected: number, total: number, emptyLabel: string): string {
  if (total === 0) return "None available";
  if (selected === 0) return emptyLabel;
  return `${selected} selected`;
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

function getThoughtLevelsForModel(providerId: string, modelId: string) {
  const model = modelId ? getModel(providerId, modelId) : undefined;
  const levels = model?.reasoning ?? getProvider(providerId)?.reasoning;
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
  const settings = useSettingsStore((s) => s.settings);
  const enabledModels = useMemo(
    () => getAllEnabledModels(settings.aiEnabledModels, settings.aiCustomModelsData),
    [settings.aiEnabledModels, settings.aiCustomModelsData],
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
    ? getThoughtLevelsForModel(form.modelProvider, form.modelId)
    : [];

  const patch = (partial: Partial<ProfileFormState>) => onFormChange({ ...form, ...partial });
  const lockIdentity = builtinCustomize;
  const lockInstructions = builtinCustomize;

  return (
    <div className="@container space-y-8">
      <div className={SETTINGS_DETAIL_SECTION}>
        <SettingsFormField label="Name" htmlFor="profile-name">
          <Input
            id="profile-name"
            className={SETTINGS_FORM_INPUT}
            placeholder="Profile name"
            value={form.name}
            readOnly={lockIdentity}
            disabled={lockIdentity}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </SettingsFormField>
        <SettingsFormField
          label="Description"
          htmlFor="profile-description"
          description="What this expert does — shown in the profile list and @ mentions."
        >
          <Input
            id="profile-description"
            className={SETTINGS_FORM_INPUT}
            placeholder="Short description"
            value={form.description}
            readOnly={lockIdentity}
            disabled={lockIdentity}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </SettingsFormField>
      </div>

      <div>
        <h3 className={SETTINGS_CATEGORY_HEADER}>Model</h3>
        <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
          Optional. Leave default to use the chat composer model when this profile is active.
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
              const levels = getThoughtLevelsForModel(providerId, modelId);
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
              <AppSelectValue placeholder="Chat default" />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="__default__">Chat default</AppSelectItem>
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
                <AppSelectValue placeholder="Reasoning depth" />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="__default__">Default depth</AppSelectItem>
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
        <h3 className={SETTINGS_CATEGORY_HEADER}>Instructions</h3>
        <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
          Role and delegation strategy only — citation formats and Task tables live in Knowledge
          modules synced below.
        </p>
        <Textarea
          value={form.instructions}
          readOnly={lockInstructions}
          disabled={lockInstructions}
          placeholder="You are a citation auditor. Focus on bib consistency and cite key usage…"
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
                title="Knowledge modules"
                summary={selectionSummary(
                  form.modules.length,
                  profileModules.length,
                  "None selected",
                )}
                defaultOpen={form.modules.length > 0}
              >
                <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
                  Built-in workflow guides — select which ones to inline into this agent&apos;s
                  synced <code className="text-[11px]">agent.md</code>. Workspace folders always
                  inject via global <code className="text-[11px]">_prism-system.md</code>.
                </p>
                <p className={cn(SETTINGS_ROW_DESC, "mb-3 text-muted-foreground")}>
                  <strong>Modules carry the tool-scheduling discipline.</strong> A subagent only
                  knows how to use a tool (e.g. <code className="text-[11px]">citation-health</code>)
                  if the module that teaches it is assembled here. Write
                  <em> Instructions</em> as role/responsibility prose only — do not hardcode tool
                  call sequences there. Example: a citation reviewer needs the
                  <code className="text-[11px]"> Citation &amp; Bibliography Audit</code> module
                  assembled, or it will not know about <code className="text-[11px]">citation-health</code>.
                </p>
                {profileModules.length === 0 ? (
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    No profile modules available.
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
            title="Skills"
            summary={selectionSummary(
              form.skills.length,
              editorOptions.skills.length,
              "All installed skills",
            )}
            defaultOpen={form.skills.length > 0}
          >
            <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
              Empty = all installed skills. Select to restrict.
            </p>
            {editorOptions.skills.length === 0 ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                No skills installed — add them in Settings → Skills.
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
            title="MCP servers"
            summary={selectionSummary(
              form.mcpServers.length,
              editorOptions.mcpServers.length,
              "All configured servers",
            )}
            defaultOpen={form.mcpServers.length > 0}
          >
            <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
              Empty = all configured servers. Select to restrict.
            </p>
            {editorOptions.mcpServers.length === 0 ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                No MCP servers — configure them in Settings → Tools &amp; MCP.
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
            title="Rules"
            summary={selectionSummary(
              form.rules.length,
              editorOptions.rules.length,
              "All enabled rules",
            )}
            defaultOpen={form.rules.length > 0}
          >
            <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
              Subset of enabled project rules injected each chat turn. Empty = all enabled rules
              with <code className="text-[11px]">apply: always</code>. Non-empty = only selected
              names (Orchestrator main session only).
            </p>
            {editorOptions.rules.length === 0 ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                No custom rules — add them in Settings → Prompts &amp; Rules.
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

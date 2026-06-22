import { useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settings-store";
import {
  getAllEnabledModels,
  getModel,
  getProvider,
} from "@/lib/providers";
import { cn } from "@/lib/utils";
import { InlineDeleteButton } from "./inline-delete-button";
import type { ProfileEditorOptions } from "@shared/agent-profiles";

const SECTION =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";
const HINT = "text-[length:var(--font-size-12)] text-muted-foreground mb-3";
const CARD_GRID = "grid grid-cols-1 sm:grid-cols-2 gap-2";
const SELECTABLE_CARD =
  "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
const CARD_TITLE = "text-[length:var(--font-size-13)] font-medium leading-snug";
const CARD_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-1 line-clamp-2";

const INLINE_INPUT =
  "w-full bg-transparent outline-none placeholder:text-muted-foreground/50 focus:ring-0 border-0 p-0";

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
          {description && <p className={CARD_DESC}>{description}</p>}
        </div>
      </div>
    </button>
  );
}

interface ProfileEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ProfileFormState;
  onFormChange: (next: ProfileFormState) => void;
  editorOptions: ProfileEditorOptions | null;
  /** Built-in profile: lock name/description/instructions, allow capability edits. */
  builtinCustomize?: boolean;
  saving?: boolean;
  saveLabel?: string;
  onSave?: () => void;
  onResetBuiltin?: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
  onDeleteRequest?: () => void;
}

export function ProfileEditorDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  editorOptions,
  builtinCustomize = false,
  saving = false,
  saveLabel = "Save",
  onSave,
  onResetBuiltin,
  onDelete,
  deletePending = false,
  onDeleteRequest,
}: ProfileEditorDialogProps) {
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

  const modelValue = form.modelProvider && form.modelId
    ? `${form.modelProvider}::${form.modelId}`
    : "";

  const thoughtLevels = form.modelProvider
    ? getThoughtLevelsForModel(form.modelProvider, form.modelId)
    : [];

  const patch = (partial: Partial<ProfileFormState>) => onFormChange({ ...form, ...partial });
  const lockIdentity = builtinCustomize;
  const lockInstructions = builtinCustomize;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(920px,calc(100vw-2rem))] max-w-[920px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <div className="overflow-y-auto flex-1 min-h-0 px-8 pt-8 pb-6 space-y-8">
          {/* Identity — inline editable */}
          <div className="space-y-2 border-b border-border pb-6">
            <input
              className={cn(
                INLINE_INPUT,
                "text-[length:var(--font-dialog-title)] font-semibold",
                lockIdentity && "cursor-default",
              )}
              placeholder="Profile name"
              value={form.name}
              readOnly={lockIdentity}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <input
              className={cn(
                INLINE_INPUT,
                "text-[length:var(--font-dialog-label)] text-muted-foreground",
                lockIdentity && "cursor-default",
              )}
              placeholder="Short description — what this expert does"
              value={form.description}
              readOnly={lockIdentity}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>

          {/* Model */}
          <div>
            <p className={SECTION}>Model</p>
            <p className={HINT}>
              Optional. Leave default to use the chat composer model when this profile is active.
            </p>
            <div className="flex flex-wrap gap-3">
              <Select
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
                <SelectTrigger className="w-[min(320px,100%)] h-9 text-[length:var(--font-size-13)]">
                  <SelectValue placeholder="Chat default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Chat default</SelectItem>
                  {Array.from(modelGroups.entries()).map(([providerId, entries]) => (
                    <SelectGroup key={providerId}>
                      <SelectLabel>{entries[0]?.provider.name ?? providerId}</SelectLabel>
                      {entries.map(({ model }) => (
                        <SelectItem
                          key={`${providerId}::${model.id}`}
                          value={`${providerId}::${model.id}`}
                        >
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>

              {form.modelProvider && thoughtLevels.length > 0 && (
                <Select
                  disabled={saving}
                  value={form.thoughtLevel || "__default__"}
                  onValueChange={(v) =>
                    patch({ thoughtLevel: v === "__default__" ? "" : v })
                  }
                >
                  <SelectTrigger className="w-[min(180px,100%)] h-9 text-[length:var(--font-size-13)]">
                    <SelectValue placeholder="Reasoning depth" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Default depth</SelectItem>
                    {thoughtLevels.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <p className={SECTION}>Instructions</p>
            <p className={HINT}>
              Additional system guidance for this expert — layered on top of project prompts.
            </p>
            <Textarea
              value={form.instructions}
              readOnly={lockInstructions}
              rows={5}
              placeholder="You are a citation auditor. Focus on bib consistency and cite key usage…"
              className={cn(
                "text-[length:var(--font-size-13)] resize-y min-h-[120px] bg-muted/20 border-border/60",
                lockInstructions && "opacity-80",
              )}
              onChange={(e) => patch({ instructions: e.target.value })}
            />
          </div>

          {editorOptions && (
            <>
              {/* Knowledge modules — primary scope */}
              <div>
                <p className={SECTION}>Knowledge modules</p>
                <p className={HINT}>
                  Scope for this expert. Only modules enabled in Prompts &amp; Rules are shown.
                </p>
                {(() => {
                  const availableModules = editorOptions.modules.filter((m) => m.globallyEnabled);
                  if (availableModules.length === 0) {
                    return (
                      <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                        No knowledge modules enabled. Turn them on in Settings → Prompts &amp; Rules.
                      </p>
                    );
                  }
                  return (
                    <div className={CARD_GRID}>
                      {availableModules.map((mod) => {
                        const selected = form.modules.includes(mod.key);
                        return (
                          <SelectableCard
                            key={mod.key}
                            title={mod.label}
                            description={mod.description}
                            selected={selected}
                            disabled={saving}
                            onToggle={() =>
                              patch({
                                modules: toggleItem(form.modules, mod.key, !selected),
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Skills */}
              <div>
                <p className={SECTION}>Skills</p>
                <p className={HINT}>Empty = all installed skills. Select to restrict.</p>
                {editorOptions.skills.length === 0 ? (
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    No skills installed — add them in Settings → Skills.
                  </p>
                ) : (
                  <div className={CARD_GRID}>
                    {editorOptions.skills.map((skill) => (
                      <SelectableCard
                        key={skill.id}
                        title={skill.name || skill.id}
                        description={skill.description}
                        selected={form.skills.includes(skill.id)}
                        disabled={saving}
                        onToggle={() =>
                          patch({
                            skills: toggleItem(form.skills, skill.id, !form.skills.includes(skill.id)),
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* MCP */}
              <div>
                <p className={SECTION}>MCP servers</p>
                <p className={HINT}>Empty = all configured servers. Select to restrict.</p>
                {editorOptions.mcpServers.length === 0 ? (
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    No MCP servers — configure them in Settings → Tools &amp; MCP.
                  </p>
                ) : (
                  <div className={CARD_GRID}>
                    {editorOptions.mcpServers.map((srv) => (
                      <SelectableCard
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
              </div>

              {/* Rules */}
              <div>
                <p className={SECTION}>Rules</p>
                <p className={HINT}>
                  Subset of project rules to append for this expert. Empty = all enabled rules.
                </p>
                {editorOptions.rules.length === 0 ? (
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    No custom rules — add them in Settings → Prompts &amp; Rules.
                  </p>
                ) : (
                  <div className={CARD_GRID}>
                    {editorOptions.rules.map((rule) => (
                      <SelectableCard
                        key={rule.name}
                        title={rule.name}
                        selected={form.rules.includes(rule.name)}
                        disabled={saving}
                        onToggle={() =>
                          patch({
                            rules: toggleItem(form.rules, rule.name, !form.rules.includes(rule.name)),
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-8 py-4 border-t border-border bg-muted/20 shrink-0">
          <div>
            {!builtinCustomize && onDelete && form.id && onDeleteRequest && (
              <InlineDeleteButton
                itemId={form.id}
                pending={deletePending}
                variant="text"
                requestLabel="Delete profile"
                disabled={saving}
                onRequest={onDeleteRequest}
                onConfirm={onDelete}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {builtinCustomize && onResetBuiltin && (
              <Button variant="outline" size="xs" onClick={onResetBuiltin} disabled={saving}>
                Reset defaults
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            {onSave && (
              <Button size="xs" onClick={onSave} disabled={saving}>
                {saveLabel}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

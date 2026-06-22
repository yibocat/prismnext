import { useState, useEffect, useCallback, useRef } from "react";
import { RotateCcwIcon, PencilIcon, RefreshCwIcon, EyeIcon } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MarkdownRenderer } from "@/components/modules/chat/markdown-renderer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
// ── Style tokens ──

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const BADGE = "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide";

const PROMPT_APPLY_HINT = "Changes apply to new conversations. Start a new chat to use the updated prompt.";

function notifyPromptConfigChanged() {
  toast.info(PROMPT_APPLY_HINT);
  void useChatStore.getState().checkPromptStale();
}

// ── Types ──

interface ModuleInfo {
  key: string; label: string; description: string; enabled: boolean;
}

interface CustomRule {
  id: string; name: string; content: string; enabled: boolean;
}

// ── Knowledge Modules ──

function KnowledgeModulesSection({ onRefresh }: { onRefresh: () => void }) {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadModules = useCallback(async () => {
    try {
      const mods = await window.electronAPI.settingsGetModules();
      setModules(mods);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModules(); }, [loadModules]);

  const handleModuleToggle = async (key: string, enabled: boolean) => {
    setModules((prev) => prev.map((m) => (m.key === key ? { ...m, enabled } : m)));
    try {
      await window.electronAPI.settingsSetModule(key, enabled);
      onRefresh();
      notifyPromptConfigChanged();
    } catch {
      setModules((prev) => prev.map((m) => (m.key === key ? { ...m, enabled: !enabled } : m)));
    }
  };

  return (
    <div className={CARD}>
      {loading ? (
        <div className={cn(ROW, "!block")}>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">Loading…</p>
        </div>
      ) : modules.map((mod) => (
        <div key={mod.key} className={ROW}>
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <p className={ROW_LABEL}>{mod.label}</p>
              <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Built-in</span>
            </div>
            <p className={ROW_DESC}>{mod.description}</p>
          </div>
          <Switch checked={mod.enabled} onCheckedChange={(v) => handleModuleToggle(mod.key, v)} />
        </div>
      ))}
    </div>
  );
}

// ── Project Rules (custom rules from settings.json) ──

function ProjectRulesSection({ onRefresh }: { onRefresh: () => void }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot) ?? undefined;
  const [rules, setRules] = useState<CustomRule[]>([]);
  const settingsPath = projectRoot ? `${projectRoot}/.prismnext/settings.json` : "";

  const loadRules = useCallback(async () => {
    if (!projectRoot) { setRules([]); return; }
    try {
      const exists = await window.electronAPI.fsExists(settingsPath);
      if (exists) {
        const result = await window.electronAPI.fsRead(settingsPath);
        const settings = result?.content ? JSON.parse(result.content) : {};
        const raw = Array.isArray(settings.customRules) ? settings.customRules : [];
        setRules(raw.map((r: CustomRule) => ({
          ...r,
          enabled: r.enabled !== false,
        })));
      } else {
        setRules([]);
      }
    } catch {
      setRules([]);
    }
  }, [projectRoot, settingsPath]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const saveRules = async (updated: CustomRule[]) => {
    if (!projectRoot) return;
    try {
      let settings: Record<string, unknown> = {};
      const exists = await window.electronAPI.fsExists(settingsPath);
      if (exists) {
        const result = await window.electronAPI.fsRead(settingsPath);
        settings = result?.content ? JSON.parse(result.content) : {};
      }
      settings.customRules = updated;
      await window.electronAPI.fsWrite(settingsPath, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error("Failed to save project rules:", err);
    }
  };

  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const deleteConfirm = useInlineDeleteConfirm();

  const afterRulesChange = () => {
    onRefresh();
    notifyPromptConfigChanged();
  };

  const handleSaveRule = async () => {
    if (!editName.trim() || !editContent.trim()) return;
    const isNew = !expandedRuleId;
    const ruleId = isNew ? crypto.randomUUID() : expandedRuleId;
    const existing = rules.find((r) => r.id === ruleId);
    const saved: CustomRule = {
      id: ruleId,
      name: editName.trim(),
      content: editContent.trim(),
      enabled: existing?.enabled ?? true,
    };

    const updated = isNew
      ? [...rules, saved]
      : rules.map((r) => (r.id === ruleId ? saved : r));
    await saveRules(updated);
    setRules(updated);
    setExpandedRuleId(null);
    setShowAddForm(false);
    setEditName("");
    setEditContent("");
    afterRulesChange();
  };

  const handleToggleRule = async (id: string, enabled: boolean) => {
    deleteConfirm.clearPending();
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled } : r));
    setRules(updated);
    await saveRules(updated);
    afterRulesChange();
  };

  const confirmDelete = async (id: string) => {
    deleteConfirm.clearPending();
    if (expandedRuleId === id) {
      setExpandedRuleId(null);
      setEditName("");
      setEditContent("");
    }

    const updated = rules.filter((r) => r.id !== id);
    await saveRules(updated);
    setRules(updated);
    afterRulesChange();
  };

  const openRule = (rule: CustomRule) => {
    deleteConfirm.clearPending();
    setExpandedRuleId(rule.id);
    setEditName(rule.name);
    setEditContent(rule.content);
  };

  const cancelForm = () => {
    deleteConfirm.clearPending();
    setExpandedRuleId(null);
    setShowAddForm(false);
    setEditName("");
    setEditContent("");
  };

  if (!projectRoot) {
    return (
      <div className={CARD}>
        <div className={cn(ROW, "!block")}>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            Open a project to manage project rules.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={CARD}>
        {rules.length === 0 && !showAddForm ? (
          <div className={cn(ROW, "!block")}>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">No project rules yet.</p>
          </div>
        ) : (
          rules.map((rule) =>
            expandedRuleId === rule.id ? (
              <div key={rule.id} className="py-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] font-medium outline-none focus:border-primary/40"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Rule name"
                  />
                  <InlineDeleteButton
                    itemId={rule.id}
                    pending={deleteConfirm.isPending(rule.id)}
                    onRequest={() => deleteConfirm.setPendingId(rule.id)}
                    onConfirm={() => void confirmDelete(rule.id)}
                  />
                </div>
                <Textarea
                  className="min-h-24 font-mono !text-[length:var(--font-size-12)] resize-y"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Rule content — injected into the system prompt when enabled."
                />
                <div className="flex items-center gap-2">
                  <Button size="xs" onClick={handleSaveRule} disabled={!editName.trim() || !editContent.trim()}>Save</Button>
                  <Button variant="ghost" size="xs" onClick={cancelForm}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div key={rule.id} className={cn(ROW, "cursor-pointer")} onClick={() => openRule(rule)}>
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <p className={ROW_LABEL}>{rule.name}</p>
                    <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Custom</span>
                  </div>
                  <p className={cn(ROW_DESC, "truncate")}>
                    {rule.content.slice(0, 80)}{rule.content.length > 80 && "…"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) => handleToggleRule(rule.id, v)}
                  />
                  <InlineDeleteButton
                    itemId={rule.id}
                    pending={deleteConfirm.isPending(rule.id)}
                    stopPropagation
                    onRequest={() => deleteConfirm.setPendingId(rule.id)}
                    onConfirm={() => void confirmDelete(rule.id)}
                  />
                </div>
              </div>
            ),
          )
        )}

        {showAddForm ? (
          <div className="py-3 space-y-3">
            <input
              type="text"
              className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40"
              placeholder="Rule name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Textarea
              className="min-h-24 font-mono !text-[length:var(--font-size-12)] resize-y"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Rule content — injected into the system prompt when enabled."
            />
            <div className="flex items-center gap-2">
              <Button size="xs" onClick={handleSaveRule} disabled={!editName.trim() || !editContent.trim()}>Add rule</Button>
              <Button variant="ghost" size="xs" onClick={cancelForm}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="py-2.5">
            <Button variant="ghost" size="xs" onClick={() => setShowAddForm(true)}>+ Add project rule</Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Component ──

export function PromptsRulesSettings() {
  const agentSystemPrompt = useSettingsStore((s) => s.settings.agentSystemPrompt) ?? "";
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [localPrompt, setLocalPrompt] = useState(agentSystemPrompt);
  const localPromptRef = useRef(localPrompt);
  localPromptRef.current = localPrompt;
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [dialogMode, setDialogMode] = useState<"edit" | "preview">("edit");
  const isCustom = localPrompt.trim().length > 0;

  const [assembledPrompt, setAssembledPrompt] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const refreshPreview = useCallback(async (customPromptOverride?: string) => {
    const cp = customPromptOverride !== undefined ? customPromptOverride : localPromptRef.current;
    setPreviewLoading(true);
    try {
      const result = await window.electronAPI.settingsGetAssembledPrompt(projectRoot ?? undefined, cp || undefined);
      setAssembledPrompt(result);
    } catch {
      /* ignore */
    } finally {
      setPreviewLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    setLocalPrompt(agentSystemPrompt);
    refreshPreview(agentSystemPrompt);
  }, [projectRoot, agentSystemPrompt, refreshPreview]);

  const handlePromptChange = (value: string) => { setLocalPrompt(value); refreshPreview(value); };
  const handleSavePrompt = () => {
    updateSettings({ agentSystemPrompt: localPrompt });
    setEditingPrompt(false);
    notifyPromptConfigChanged();
  };
  const handleCancelPrompt = () => {
    setLocalPrompt(agentSystemPrompt);
    setEditingPrompt(false);
    refreshPreview(agentSystemPrompt);
  };
  const handleResetPrompt = () => {
    setLocalPrompt("");
    updateSettings({ agentSystemPrompt: "" });
    setEditingPrompt(false);
    refreshPreview("");
    notifyPromptConfigChanged();
  };

  const agentsMdPath = projectRoot ? `${projectRoot}/.prismnext/agent/AGENTS.md` : "";
  const [agentsMdContent, setAgentsMdContent] = useState("");
  const [localAgentsMd, setLocalAgentsMd] = useState("");
  const [editingAgentsMd, setEditingAgentsMd] = useState(false);
  const [agentsMdDialogMode, setAgentsMdDialogMode] = useState<"edit" | "preview">("edit");
  const [agentsMdSaving, setAgentsMdSaving] = useState(false);
  const hasAgentsMd = agentsMdContent.trim().length > 0;

  const loadAgentsMd = useCallback(async () => {
    if (!projectRoot) {
      setAgentsMdContent("");
      setLocalAgentsMd("");
      return;
    }
    try {
      const exists = await window.electronAPI.fsExists(agentsMdPath);
      if (exists) {
        const r = await window.electronAPI.fsRead(agentsMdPath);
        const content = r?.content || "";
        setAgentsMdContent(content);
        setLocalAgentsMd(content);
      } else {
        setAgentsMdContent("");
        setLocalAgentsMd("");
      }
    } catch {
      setAgentsMdContent("");
      setLocalAgentsMd("");
    }
  }, [projectRoot, agentsMdPath]);

  useEffect(() => { loadAgentsMd(); }, [loadAgentsMd]);

  const handleAgentsMdChange = (value: string) => setLocalAgentsMd(value);

  const handleSaveAgentsMd = async () => {
    if (!projectRoot) return;
    setAgentsMdSaving(true);
    try {
      await window.electronAPI.fsWrite(agentsMdPath, localAgentsMd);
      setAgentsMdContent(localAgentsMd);
      setEditingAgentsMd(false);
      refreshPreview();
      notifyPromptConfigChanged();
    } catch (err) {
      console.error("Failed to save AGENTS.md:", err);
      toast.error("Failed to save AGENTS.md");
    } finally {
      setAgentsMdSaving(false);
    }
  };

  const handleCancelAgentsMd = () => {
    setLocalAgentsMd(agentsMdContent);
    setEditingAgentsMd(false);
    setAgentsMdDialogMode("edit");
  };

  const openAgentsMdDialog = () => {
    setLocalAgentsMd(agentsMdContent);
    setAgentsMdDialogMode("edit");
    setEditingAgentsMd(true);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Prompts &amp; Rules</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            System prompt, project instructions, knowledge modules, and project rules.
          </p>
        </div>

        {/* ── System Prompt ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>
            System Prompt
            {isCustom && (
              <span className="ml-1.5 normal-case font-normal text-[length:var(--font-size-11)] text-primary">(custom)</span>
            )}
          </h3>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            {isCustom
              ? "Custom persona replaces the built-in default. Modules and project instructions still append below."
              : "Using the built-in Prism editor persona. Write a custom prompt to override it."}
          </p>
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="py-2.5">
              <p className={ROW_DESC}>
                {assembledPrompt
                  ? `${assembledPrompt.length.toLocaleString()} characters in the assembled system prompt.`
                  : "No prompt assembled yet."}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <div>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={async () => {
                      setDialogMode("edit");
                      if (!isCustom) {
                        try {
                          setLocalPrompt(await window.electronAPI.settingsGetDefaultPersona());
                        } catch {
                          /* ignore */
                        }
                      }
                      setEditingPrompt(true);
                    }}
                  >
                    <PencilIcon className="size-3 mr-1" />
                    {isCustom ? "Edit custom prompt" : "Write custom prompt"}
                  </Button>
                </div>
                <div>
                  <Button variant="outline" size="xs" disabled={!assembledPrompt?.trim()} onClick={() => setPreviewOpen(true)}>
                    <EyeIcon className="size-3 mr-1" />Preview assembled prompt
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Dialog open={editingPrompt} onOpenChange={(o) => { if (!o) handleCancelPrompt(); else setEditingPrompt(true); }}>
            <DialogContent className="w-[880px] h-[82vh] flex flex-col">
              <DialogHeader><DialogTitle className="text-[length:var(--font-dialog-title)]">Custom System Prompt</DialogTitle></DialogHeader>
              {dialogMode === "edit" ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  <Textarea
                    className="flex-1 min-h-[480px] font-mono !text-[length:var(--font-size-12)] resize-none"
                    value={localPrompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    placeholder="Write your own system prompt…"
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto rounded-md border border-input bg-muted/30 p-4">
                  {localPrompt.trim() ? <MarkdownRenderer content={localPrompt} />
                    : <p className="text-[length:var(--font-size-13)] text-muted-foreground italic">Nothing to preview yet.</p>}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button size="xs" onClick={handleSavePrompt}>Save</Button>
                <Button variant="ghost" size="xs" onClick={handleCancelPrompt}>Cancel</Button>
                <div className="flex-1" />
                <div className="flex items-center rounded-md border border-border p-0.5">
                  <button type="button" className={cn("px-2.5 py-0.5 rounded-sm text-[length:var(--font-size-11)] font-medium transition-colors", dialogMode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setDialogMode("edit")}>Write</button>
                  <button type="button" className={cn("px-2.5 py-0.5 rounded-sm text-[length:var(--font-size-11)] font-medium transition-colors", dialogMode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setDialogMode("preview")}>Preview</button>
                </div>
                <Button variant="ghost" size="xs" disabled={!isCustom} onClick={handleResetPrompt}><RotateCcwIcon className="size-3 mr-1" />Reset</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="w-[880px] h-[82vh] flex flex-col">
              <DialogHeader><DialogTitle className="text-[length:var(--font-dialog-title)]">Assembled System Prompt</DialogTitle></DialogHeader>
              <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border bg-muted/30 p-4">
                {previewLoading && (
                  <div className="flex items-center gap-2 mb-3 text-[length:var(--font-size-12)] text-muted-foreground">
                    <RefreshCwIcon className="size-3 animate-spin" />Updating…
                  </div>
                )}
                <MarkdownRenderer content={assembledPrompt} />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Project Instructions (AGENTS.md) ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Project Instructions</h3>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            Per-project agent instructions from{" "}
            <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">.prismnext/agent/AGENTS.md</code>
            {" "}— injected as Layer 1 on every chat. Run{" "}
            <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">/setup</code>
            {" "}in chat to scaffold from the project.
          </p>
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="py-2.5">
              {!projectRoot ? (
                <p className="text-[length:var(--font-size-12)] text-muted-foreground">Open a project to edit project instructions.</p>
              ) : (
                <>
                  <p className={ROW_DESC}>
                    {hasAgentsMd
                      ? `${agentsMdContent.length.toLocaleString()} characters in project instructions.`
                      : "No AGENTS.md yet — create one or run /setup in chat."}
                  </p>
                  <div className="mt-2">
                    <Button variant="outline" size="xs" onClick={openAgentsMdDialog}>
                      <PencilIcon className="size-3 mr-1" />
                      {hasAgentsMd ? "Edit project instructions" : "Create AGENTS.md"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <Dialog
            open={editingAgentsMd}
            onOpenChange={(o) => {
              if (!o) handleCancelAgentsMd();
              else setEditingAgentsMd(true);
            }}
          >
            <DialogContent className="w-[880px] h-[82vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-[length:var(--font-dialog-title)]">Project Instructions (AGENTS.md)</DialogTitle>
              </DialogHeader>
              {agentsMdDialogMode === "edit" ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  <Textarea
                    className="flex-1 min-h-[480px] font-mono !text-[length:var(--font-size-12)] resize-none"
                    value={localAgentsMd}
                    onChange={(e) => handleAgentsMdChange(e.target.value)}
                    placeholder="# Project Instructions&#10;&#10;Add project-specific instructions for the AI agent."
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto rounded-md border border-input bg-muted/30 p-4">
                  {localAgentsMd.trim() ? (
                    <MarkdownRenderer content={localAgentsMd} />
                  ) : (
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground italic">
                      Nothing to preview yet.
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button size="xs" onClick={handleSaveAgentsMd} disabled={agentsMdSaving}>
                  {agentsMdSaving ? "Saving…" : "Save"}
                </Button>
                <Button variant="ghost" size="xs" onClick={handleCancelAgentsMd}>Cancel</Button>
                <div className="flex-1" />
                <div className="flex items-center rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    className={cn(
                      "px-2.5 py-0.5 rounded-sm text-[length:var(--font-size-11)] font-medium transition-colors",
                      agentsMdDialogMode === "edit"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setAgentsMdDialogMode("edit")}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "px-2.5 py-0.5 rounded-sm text-[length:var(--font-size-11)] font-medium transition-colors",
                      agentsMdDialogMode === "preview"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setAgentsMdDialogMode("preview")}
                  >
                    Preview
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Knowledge Modules ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Knowledge Modules</h3>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            Project-wide capability pool. Agent profiles only show and use modules enabled here.
          </p>
          <KnowledgeModulesSection onRefresh={() => refreshPreview()} />
        </div>

        {/* ── Project Rules ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Project Rules</h3>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            Additional per-project rules stored in{" "}
            <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">.prismnext/settings.json</code>
          </p>
          <ProjectRulesSection onRefresh={() => refreshPreview()} />
        </div>

      </div>
    </div>
  );
}

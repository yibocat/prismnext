import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import {
  loadProjectRules,
  saveProjectRules,
  type ProjectRule,
} from "@/lib/settings/project-rules";
import { notifyPromptConfigChanged } from "@/lib/settings/prompt-config-notify";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_INPUT,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";

type ProjectRuleSlot = Extract<SettingsPanelSlot, { kind: "project-rule" }>;

export function ProjectRuleEditorPanel({ slot }: { slot: ProjectRuleSlot }) {
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isNew = slot.mode === "new";
  const ruleId = slot.mode === "edit" ? slot.ruleId : undefined;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!projectRoot) {
      setLoading(false);
      return;
    }
    if (isNew) {
      setName("");
      setContent("");
      setDeleteDialogOpen(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void loadProjectRules(projectRoot).then((rules) => {
      if (cancelled) return;
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) {
        toast.error("Rule not found.");
        closePanel();
        return;
      }
      setName(rule.name);
      setContent(rule.content);
      setDeleteDialogOpen(false);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, isNew, ruleId, closePanel]);

  const persistRules = async (rules: ProjectRule[]) => {
    if (!projectRoot) return;
    await saveProjectRules(projectRoot, rules);
  };

  const handleSave = async () => {
    if (!projectRoot || !name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const rules = await loadProjectRules(projectRoot);
      const id = isNew ? crypto.randomUUID() : ruleId!;
      const existing = rules.find((r) => r.id === id);
      const saved: ProjectRule = {
        id,
        name: name.trim(),
        content: content.trim(),
        enabled: existing?.enabled ?? true,
      };
      const updated = isNew
        ? [...rules, saved]
        : rules.map((r) => (r.id === id ? saved : r));
      await persistRules(updated);
      notifyPromptConfigChanged();
      toast.success(isNew ? "Rule added." : "Rule saved.");
      closePanel();
    } catch {
      toast.error("Failed to save rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!projectRoot || !ruleId) return;
    setDeleteDialogOpen(false);
    setSaving(true);
    try {
      const rules = await loadProjectRules(projectRoot);
      await persistRules(rules.filter((r) => r.id !== ruleId));
      notifyPromptConfigChanged();
      toast.success("Rule deleted.");
      closePanel();
    } catch {
      toast.error("Failed to delete rule.");
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Open a project to manage project rules.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          Injected into the system prompt when enabled. Stored in{" "}
          <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">
            .prismnext/settings.json
          </code>
          .
        </p>

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField label="Rule name" htmlFor="project-rule-name">
            <Input
              id="project-rule-name"
              className={SETTINGS_FORM_INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Citation style"
            />
          </SettingsFormField>

          <SettingsFormField
            label="Rule content"
            htmlFor="project-rule-content"
            description="Plain text appended to the agent system prompt when this rule is enabled."
          >
            <Textarea
              id="project-rule-content"
              className={SETTINGS_FORM_TEXTAREA}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Always use natbib for citations…"
            />
          </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button
            size="xs"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim() || !content.trim()}
          >
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isNew ? "Add rule" : "Save"}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            Cancel
          </Button>
          {!isNew ? (
            <>
              <span className="flex-1 min-w-[1rem]" />
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={saving}
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Delete rule</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-medium text-foreground">{name || "this rule"}</span>? This
              removes it from project configuration.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="shadow-none"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { notifyPromptConfigChanged } from "@/lib/settings/prompt-config-notify";
import {
  defaultNewRuleMarkdown,
  validateRuleMarkdown,
} from "@/lib/agent/rules-markdown";
import { SettingsMarkdownEditor } from "./settings-markdown-editor";
import { MarkdownContentPreview } from "./markdown-content-preview";
import { SettingsMarkdownToolbar } from "./settings-markdown-toolbar";

type RuleMarkdownSlot = Extract<SettingsPanelSlot, { kind: "rule-markdown" }>;

export function RuleMarkdownPanel({ slot }: { slot: RuleMarkdownSlot }) {
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"source" | "preview">(
    slot.mode === "edit" ? "preview" : "source",
  );

  const ruleDirRel =
    slot.mode === "edit" ? `.prismnext/agent/rules/${slot.ruleId}` : null;
  const rulePath =
    projectRoot && ruleDirRel
      ? `${projectRoot.replace(/[/\\]+$/, "")}/${ruleDirRel}/RULE.md`
      : null;

  const loadContent = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (slot.mode === "new") {
        const template = defaultNewRuleMarkdown();
        setContent(template);
        setSavedContent(template);
        if (!silent) setLoading(false);
        return;
      }
      if (!rulePath) {
        setContent("");
        setSavedContent("");
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const result = await window.electronAPI.fsRead(rulePath);
        const text = result?.content ?? "";
        setContent(text);
        setSavedContent(text);
      } catch {
        toast.error("Failed to load RULE.md.");
        closePanel();
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slot.mode, rulePath, closePanel],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadContent({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadContent]);

  useEffect(() => {
    void loadContent();
    setViewMode(slot.mode === "edit" ? "preview" : "source");
  }, [loadContent, slot.mode, slot.mode === "edit" ? slot.ruleId : null]);

  const handleSave = async () => {
    if (!projectRoot) return;
    const expectedId = slot.mode === "edit" ? slot.ruleId : undefined;
    const validation = validateRuleMarkdown(content, expectedId);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    if (slot.mode === "new") {
      const list = await window.electronAPI.agentListRules(projectRoot);
      if (list.some((r) => r.id === validation.name)) {
        toast.error(`Rule "${validation.name}" already exists.`);
        return;
      }
    }

    setSaving(true);
    try {
      await window.electronAPI.agentInstallRule(projectRoot, validation.name, content.trim());
      setSavedContent(content);
      notifyPromptConfigChanged();
      toast.success(slot.mode === "new" ? `Created "${validation.name}".` : "Rule updated.");
      closePanel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule.");
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Open a project to edit rules.
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
    <div className="flex h-full min-h-0 flex-col">
      <SettingsMarkdownToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRefresh={slot.mode === "edit" ? () => void handleRefresh() : undefined}
        refreshing={refreshing}
        actions={{
          onSave: () => void handleSave(),
          onCancel: closePanel,
          saving,
        }}
      />

      <div className="flex-1 min-h-0">
        {viewMode === "source" ? (
          <SettingsMarkdownEditor value={content} onChange={setContent} className="h-full" />
        ) : (
          <MarkdownContentPreview content={content} variant="rule" className="h-full" />
        )}
      </div>
    </div>
  );
}

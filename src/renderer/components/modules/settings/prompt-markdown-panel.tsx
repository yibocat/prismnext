import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { notifyPromptConfigChanged } from "@/lib/settings/prompt-config-notify";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { projectAgentsMdRel } from "@shared/workbench-paths";
import { SettingsMarkdownEditor } from "./settings-markdown-editor";
import { MarkdownContentPreview } from "./markdown-content-preview";
import { SettingsMarkdownToolbar } from "./settings-markdown-toolbar";

type PromptMarkdownSlot = Extract<SettingsPanelSlot, { kind: "prompt-markdown" }>;

export function PromptMarkdownPanel({ slot }: { slot: PromptMarkdownSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"source" | "preview">("preview");

  const agentsMdPath = projectRoot
    ? `${projectRoot.replace(/[/\\]+$/, "")}/${projectAgentsMdRel()}`
    : "";

  const loadContent = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        if (slot.doc === "system-prompt") {
          let text = useSettingsStore.getState().settings.agentSystemPrompt ?? "";
          if (!text.trim()) {
            try {
              text = await window.electronAPI.settingsGetDefaultPersona();
            } catch {
              text = "";
            }
          }
          setContent(text);
          setSavedContent(useSettingsStore.getState().settings.agentSystemPrompt ?? "");
        } else if (slot.doc === "agents-md") {
          if (!projectRoot) {
            setContent("");
            setSavedContent("");
            return;
          }
          const exists = await window.electronAPI.fsExists(agentsMdPath);
          if (exists) {
            const r = await window.electronAPI.fsRead(agentsMdPath);
            const text = r?.content || "";
            setContent(text);
            setSavedContent(text);
          } else {
            setContent("");
            setSavedContent("");
          }
        }
      } catch {
        toast.error(t("settings.editor.prompt.toast.loadFailed"));
        closePanel();
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slot.doc, projectRoot, agentsMdPath, closePanel, t],
  );

  useEffect(() => {
    void loadContent();
    setViewMode("preview");
  }, [slot.doc, loadContent]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (slot.doc === "system-prompt") {
        updateSettings({ agentSystemPrompt: content });
        setSavedContent(content);
        notifyPromptConfigChanged();
        toast.success(t("settings.editor.prompt.toast.saved"));
      } else if (slot.doc === "agents-md") {
        if (!projectRoot) return;
        await window.electronAPI.fsWrite(agentsMdPath, content);
        setSavedContent(content);
        notifyPromptConfigChanged();
        toast.success(t("settings.editor.prompt.toast.agentsSaved"));
      }
      closePanel();
    } catch {
      toast.error(t("settings.editor.prompt.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (slot.doc !== "system-prompt") return;
    updateSettings({ agentSystemPrompt: "" });
    setSavedContent("");
    notifyPromptConfigChanged();
    toast.success(t("settings.editor.prompt.toast.restored"));
    await loadContent({ silent: true });
    setViewMode("preview");
  };

  const isCustomSystemPrompt = slot.doc === "system-prompt" && savedContent.trim().length > 0;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("settings.editor.prompt.loading")}
      </div>
    );
  }

  if (slot.doc === "agents-md" && !projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.prompt.openProjectAgents")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SettingsMarkdownToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        actions={{
          onSave: () => void handleSave(),
          onCancel: closePanel,
          saving,
          onResetToDefault:
            slot.doc === "system-prompt" ? () => void handleResetToDefault() : undefined,
          resetDisabled: !isCustomSystemPrompt,
        }}
      />

      <div className="flex-1 min-h-0">
        {viewMode === "source" ? (
          <SettingsMarkdownEditor value={content} onChange={setContent} className="h-full" />
        ) : (
          <MarkdownContentPreview content={content} className="h-full" />
        )}
      </div>
    </div>
  );
}

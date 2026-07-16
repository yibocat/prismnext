import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { SettingsMarkdownEditor } from "./settings-markdown-editor";
import { MarkdownContentPreview } from "./markdown-content-preview";
import { SettingsMarkdownToolbar } from "./settings-markdown-toolbar";

export function ResearchBriefPanel() {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [briefPath, setBriefPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"source" | "preview">("preview");

  const loadContent = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!projectRoot) {
        setContent("");
        setSavedContent("");
        setBriefPath(null);
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        await window.electronAPI.researchBriefEnsure(projectRoot);
        const { absolutePath } = await window.electronAPI.researchBriefGetPath(projectRoot);
        setBriefPath(absolutePath);
        const result = await window.electronAPI.fsRead(absolutePath);
        const text = result?.content ?? "";
        setContent(text);
        setSavedContent(text);
      } catch {
        toast.error(t("settings.editor.brief.toast.loadFailed"));
        closePanel();
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectRoot, closePanel, t],
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
  }, [loadContent]);

  const handleSave = async () => {
    if (!projectRoot || !briefPath) return;
    setSaving(true);
    try {
      await window.electronAPI.fsWrite(briefPath, content);
      setSavedContent(content);
      toast.success(t("settings.editor.brief.toast.saved"));
    } catch {
      toast.error(t("settings.editor.brief.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.brief.openProject")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("settings.editor.brief.loading")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SettingsMarkdownToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRefresh={() => void handleRefresh()}
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

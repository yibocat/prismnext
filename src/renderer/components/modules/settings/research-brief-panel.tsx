import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { useSettingsEditorSlotOfKind } from "@/hooks/use-settings-editor";
import { openResearchBrief } from "@/lib/files/open-research-brief";
import { MarkdownContentPreview } from "./markdown-content-preview";
import { SettingsMarkdownToolbar } from "./settings-markdown-toolbar";
import { SETTINGS_ROW_DESC } from "./settings-tokens";

/** Settings: read-only preview of `.brief.md`. Edit opens Files in the main workspace. */
export function ResearchBriefPanel() {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const slot = useSettingsEditorSlotOfKind("research-brief");
  const focusSection = slot?.focusSection;
  const previewRef = useRef<HTMLDivElement>(null);

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadContent = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!projectRoot) {
        setContent("");
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        await window.electronAPI.researchBriefEnsure(projectRoot);
        const { absolutePath } = await window.electronAPI.researchBriefGetPath(projectRoot);
        const result = await window.electronAPI.fsRead(absolutePath);
        setContent(result?.content ?? "");
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

  // Scroll preview toward the linked ## section when opened from an experiment.
  useEffect(() => {
    if (!focusSection || loading) return;
    const root = previewRef.current;
    if (!root) return;
    const target = focusSection.toLowerCase();
    const id = window.setTimeout(() => {
      const headings = root.querySelectorAll("h1, h2, h3");
      for (const el of headings) {
        const text = (el.textContent ?? "").trim().toLowerCase();
        if (text === target || text.includes(target)) {
          el.scrollIntoView({ block: "start", behavior: "smooth" });
          break;
        }
      }
    }, 80);
    return () => window.clearTimeout(id);
  }, [focusSection, loading, content]);

  const handleEditInFiles = () => {
    void openResearchBrief({ focusSection, leaveSettings: true });
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
        viewMode="preview"
        readOnly
        onRefresh={() => void handleRefresh()}
        refreshing={refreshing}
      />
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.brief.readOnlyHint")}</p>
        <Button variant="outline" size="xs" className="shrink-0" onClick={handleEditInFiles}>
          {t("settings.editor.brief.editInFiles")}
        </Button>
      </div>
      <div className="flex-1 min-h-0" ref={previewRef}>
        <MarkdownContentPreview content={content} variant="rule" className="h-full" />
      </div>
    </div>
  );
}

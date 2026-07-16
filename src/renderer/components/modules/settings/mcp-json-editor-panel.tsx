import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { useMcpServersStore } from "@/stores/mcp-servers-store";
import { SettingsJsonEditor } from "./settings-json-editor";
import { SettingsJsonToolbar } from "./settings-json-toolbar";
import { SETTINGS_DETAIL_SHELL, SETTINGS_ROW_DESC } from "./settings-tokens";

export function McpJsonEditorPanel() {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const readRaw = useMcpServersStore((s) => s.readRaw);
  const writeRaw = useMcpServersStore((s) => s.writeRaw);
  const saving = useMcpServersStore((s) => s.saving);

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");

  const load = useCallback(async () => {
    if (!projectRoot) {
      setContent("");
      setSavedContent("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const raw = await readRaw(projectRoot);
      setContent(raw);
      setSavedContent(raw);
    } catch {
      toast.error(t("settings.editor.mcpJson.toast.loadFailed"));
      closePanel();
    } finally {
      setLoading(false);
    }
  }, [projectRoot, readRaw, closePanel]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = content !== savedContent;
  const canSave = dirty && content.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!projectRoot || !canSave) return;
    try {
      JSON.parse(content);
    } catch {
      toast.error(t("settings.editor.mcpJson.toast.invalidJson"));
      return;
    }
    try {
      await writeRaw(projectRoot, content);
      setSavedContent(content);
      toast.success(t("settings.editor.mcpJson.toast.saved"));
      closePanel();
    } catch {
      toast.error(t("settings.editor.mcpJson.toast.saveFailed"));
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.mcpJson.openProject")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("settings.editor.mcpJson.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-auto">
      <SettingsJsonToolbar
        primaryLabel={t("common.save")}
        onPrimary={() => void handleSave()}
        onCancel={closePanel}
        disabled={!canSave}
        saving={saving}
      />
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.mcpJson.intro")}</p>
        <SettingsJsonEditor variant="field" value={content} onChange={setContent} />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useTeamsStore } from "@/stores/teams-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import { useMcpServersStore, mcpJsonRelPath } from "@/stores/mcp-servers-store";
import { TeamPicker } from "../teams/team-picker";
import { teamDisplayName } from "@/lib/teams/team-display-name";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { PROJECT_DEFAULT_TEAM_ID } from "@shared/teams/types";
import { SettingsJsonEditor } from "./settings-json-editor";
import { SettingsJsonToolbar } from "./settings-json-toolbar";
import { SETTINGS_DETAIL_SHELL, SETTINGS_ROW_DESC } from "./settings-tokens";

type JsonSlot = Extract<SettingsPanelSlot, { kind: "mcp-json" }>;

export function McpJsonEditorPanel({ slot }: { slot?: JsonSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const catalog = useTeamsStore((s) => s.catalog);
  const loadTeams = useTeamsStore((s) => s.load);
  const readRaw = useMcpServersStore((s) => s.readRaw);
  const writeRaw = useMcpServersStore((s) => s.writeRaw);
  const saving = useMcpServersStore((s) => s.saving);

  // Only lock when team detail (or caller) asks — Settings header leaves picker free.
  const lockedTeam = Boolean(slot?.lockTarget && slot.targetTeamId);
  const [targetTeamId, setTargetTeamId] = useState(
    slot?.targetTeamId ?? PROJECT_DEFAULT_TEAM_ID,
  );
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");

  useEffect(() => {
    if (slot?.targetTeamId) setTargetTeamId(slot.targetTeamId);
  }, [slot?.targetTeamId]);

  useEffect(() => {
    if (!projectRoot) return;
    void loadTeams(projectRoot);
  }, [projectRoot, loadTeams]);

  const pickerTeams = useMemo(
    () =>
      catalog
        .filter((tm) => tm.writable && tm.installed)
        .map((tm) => ({
          ...tm,
          manifest: {
            ...tm.manifest,
            name: teamDisplayName(tm.manifest.id, tm.manifest.name, t),
          },
        })),
    [catalog, t],
  );

  const targetTeamLabel = useMemo(() => {
    const tm = catalog.find((c) => c.manifest.id === targetTeamId);
    return teamDisplayName(targetTeamId, tm?.manifest.name ?? targetTeamId, t);
  }, [catalog, targetTeamId, t]);

  const load = useCallback(async () => {
    if (!projectRoot) {
      setContent("");
      setSavedContent("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const raw = await readRaw(projectRoot, targetTeamId);
      setContent(raw);
      setSavedContent(raw);
    } catch {
      toast.error(t("settings.editor.mcpJson.toast.loadFailed"));
      closePanel();
    } finally {
      setLoading(false);
    }
  }, [projectRoot, targetTeamId, readRaw, closePanel, t]);

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
      await writeRaw(projectRoot, content, targetTeamId);
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
        <p className={SETTINGS_ROW_DESC}>
          {t("settings.editor.mcpJson.intro", {
            team: targetTeamLabel,
            path: mcpJsonRelPath(targetTeamId),
          })}
        </p>
        {!lockedTeam && (
          <div className="space-y-1.5">
            <p className={SETTINGS_ROW_DESC}>{t("settings.mcp.targetTeam")}</p>
            <TeamPicker
              teams={pickerTeams}
              value={targetTeamId}
              onChange={setTargetTeamId}
              onCreateTeam={(scope) => openSettingsPanel({ kind: "team-create", scope })}
            />
          </div>
        )}
        <SettingsJsonEditor variant="field" value={content} onChange={setContent} />
      </div>
    </div>
  );
}

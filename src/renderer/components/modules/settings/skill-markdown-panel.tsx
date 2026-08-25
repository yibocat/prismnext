import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useTeamsStore } from "@/stores/teams-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { bumpSkillsRefresh } from "@/lib/settings/skills-refresh";
import {
  deleteProjectSkill,
  installProjectSkill,
  listProjectSkills,
  readBundledSkillMd,
  readSkillMdFile,
  reinstallProjectSkill,
} from "@/lib/settings";
import {
  defaultNewSkillMarkdown,
  validateSkillMarkdown,
} from "@/lib/agent/skills-markdown";
import { PROJECT_DEFAULT_TEAM_ID } from "@shared/teams/types";
import { projectTeamsRel } from "@shared/workbench/paths";
import { SettingsMarkdownEditor } from "./settings-markdown-editor";
import { MarkdownContentPreview } from "./markdown-content-preview";
import { SettingsMarkdownToolbar } from "./settings-markdown-toolbar";
import { TeamPicker } from "../teams/team-picker";
import { teamDisplayName } from "@/lib/teams/team-display-name";
import { Hint } from "@/components/ui/hint";

type SkillMarkdownSlot = Extract<SettingsPanelSlot, { kind: "skill-markdown" }>;

export function SkillMarkdownPanel({ slot }: { slot: SkillMarkdownSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const catalog = useTeamsStore((s) => s.catalog);
  const loadTeams = useTeamsStore((s) => s.load);

  const writableTeams = useMemo(
    () => catalog.filter((tm) => tm.writable && tm.installed),
    [catalog],
  );

  const [targetTeamId, setTargetTeamId] = useState(
    slot.mode === "new"
      ? (slot.targetTeamId ?? PROJECT_DEFAULT_TEAM_ID)
      : slot.mode === "edit"
        ? (slot.teamId ?? PROJECT_DEFAULT_TEAM_ID)
        : PROJECT_DEFAULT_TEAM_ID,
  );

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSource, setResetSource] = useState<"bundled" | "registry" | null>(null);
  const [bundledDefault, setBundledDefault] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"source" | "preview">(
    slot.mode === "new" ? "source" : "preview",
  );

  const skillPath = useMemo(() => {
    if (slot.mode === "edit" && slot.absPath) return slot.absPath;
    if (slot.mode === "edit" && projectRoot) {
      return `${projectRoot.replace(/[/\\]+$/, "")}/${projectTeamsRel()}/${targetTeamId}/skills/${slot.skillId}/SKILL.md`;
    }
    return null;
  }, [slot, projectRoot, targetTeamId]);

  useEffect(() => {
    if (!projectRoot) return;
    void loadTeams(projectRoot);
  }, [projectRoot, loadTeams]);

  const pickerTeams = useMemo(
    () =>
      writableTeams.map((tm) => ({
        ...tm,
        manifest: {
          ...tm.manifest,
          name: teamDisplayName(tm.manifest.id, tm.manifest.name, t),
        },
      })),
    [writableTeams, t],
  );

  const loadContent = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (slot.mode === "new") {
        const template = defaultNewSkillMarkdown();
        setContent(template);
        setSavedContent(template);
        if (!silent) setLoading(false);
        return;
      }
      if (slot.mode === "preview-bundled") {
        if (!silent) setLoading(true);
        try {
          let text: string | null = null;
          if (slot.absPath) {
            text = await readSkillMdFile(slot.absPath);
          } else {
            text = await readBundledSkillMd(slot.skillId);
          }
          if (text == null) throw new Error("pack skill not found");
          setContent(text);
          setSavedContent(text);
        } catch {
          toast.error(t("settings.editor.skillMd.toast.loadFailed"));
          closePanel();
        } finally {
          if (!silent) setLoading(false);
        }
        return;
      }
      if (!skillPath) {
        setContent("");
        setSavedContent("");
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const text = await readSkillMdFile(skillPath);
        setContent(text);
        setSavedContent(text);
      } catch {
        toast.error(t("settings.editor.skillMd.toast.loadFailed"));
        closePanel();
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slot, skillPath, closePanel, t],
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
    setViewMode(slot.mode === "new" ? "source" : "preview");
  }, [loadContent, slot.mode, slot.mode === "new" ? null : slot.skillId]);

  useEffect(() => {
    if (slot.mode !== "edit") {
      setResetSource(null);
      setBundledDefault(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const bundled = await readBundledSkillMd(slot.skillId);
        if (cancelled) return;
        if (bundled != null) {
          setBundledDefault(bundled);
          setResetSource("bundled");
          return;
        }
        if (projectRoot) {
          const list = await listProjectSkills(projectRoot);
          const info = list.find(
            (s) => s.fqid === `${targetTeamId}:${slot.skillId}` || s.id === slot.skillId,
          );
          if (!cancelled && info?.installOrigin) setResetSource("registry");
        }
      } catch {
        /* no reset source available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slot.mode, slot.mode === "new" ? null : slot.skillId, projectRoot, targetTeamId]);

  const handleResetToDefault = async () => {
    if (!projectRoot || slot.mode !== "edit" || !resetSource) return;
    setResetting(true);
    try {
      if (resetSource === "bundled") {
        await deleteProjectSkill(projectRoot, `${targetTeamId}:${slot.skillId}`);
        bumpSkillsRefresh();
        toast.success(t("settings.editor.skillMd.toast.restored"));
        closePanel();
        return;
      }
      await reinstallProjectSkill(projectRoot, slot.skillId);
      bumpSkillsRefresh();
      toast.success(t("settings.editor.skillMd.toast.restored"));
      await loadContent({ silent: true });
      setViewMode("preview");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.skillMd.toast.saveFailed"),
      );
    } finally {
      setResetting(false);
    }
  };

  const handleSave = async () => {
    if (!projectRoot) return;
    const expectedId = slot.mode === "edit" ? slot.skillId : undefined;
    const validation = validateSkillMarkdown(content, expectedId);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    if (slot.mode === "new") {
      const list = await listProjectSkills(projectRoot);
      if (list.some((s) => s.fqid === `${targetTeamId}:${validation.name}` || s.id === validation.name)) {
        toast.error(t("settings.editor.skillMd.toast.exists", { name: validation.name }));
        return;
      }
    }

    setSaving(true);
    try {
      await installProjectSkill(
        projectRoot,
        validation.name,
        content.trim(),
        targetTeamId,
      );
      setSavedContent(content);
      bumpSkillsRefresh();
      toast.success(
        slot.mode === "new"
          ? t("settings.editor.skillMd.toast.created", { name: validation.name })
          : t("settings.editor.skillMd.toast.updated"),
      );
      closePanel();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.skillMd.toast.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot && slot.mode !== "preview-bundled") {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.skillMd.openProject")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("settings.editor.skillMd.loading")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SettingsMarkdownToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        readOnly={slot.mode === "preview-bundled"}
        onRefresh={slot.mode !== "new" ? () => void handleRefresh() : undefined}
        refreshing={refreshing}
        leading={
          slot.mode === "new" ? (
            <Hint label={t("settings.editor.skillMd.targetTeam")}>
              <TeamPicker
                teams={pickerTeams}
                value={targetTeamId}
                onChange={setTargetTeamId}
                onCreateTeam={(scope) => openSettingsPanel({ kind: "team-create", scope })}
                variant="toolbar"
                className={saving ? "pointer-events-none opacity-60" : undefined}
              />
            </Hint>
          ) : undefined
        }
        actions={
          slot.mode === "preview-bundled"
            ? undefined
            : {
                onSave: () => void handleSave(),
                onCancel: closePanel,
                saving: saving || resetting,
                onResetToDefault: resetSource
                  ? () => void handleResetToDefault()
                  : undefined,
                resetDisabled:
                  resetting ||
                  (resetSource === "bundled" &&
                    bundledDefault != null &&
                    content.trim() === bundledDefault.trim()),
              }
        }
      />

      <div className="flex-1 min-h-0">
        {viewMode === "source" ? (
          <SettingsMarkdownEditor value={content} onChange={setContent} className="h-full" />
        ) : (
          <MarkdownContentPreview content={content} variant="skill" className="h-full" />
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { bumpSkillsRefresh } from "@/lib/settings/skills-refresh";
import {
  defaultNewSkillMarkdown,
  validateSkillMarkdown,
} from "@/lib/agent/skills-markdown";
import { SettingsMarkdownEditor } from "./settings-markdown-editor";
import { MarkdownContentPreview } from "./markdown-content-preview";
import { SettingsMarkdownToolbar } from "./settings-markdown-toolbar";

type SkillMarkdownSlot = Extract<SettingsPanelSlot, { kind: "skill-markdown" }>;

export function SkillMarkdownPanel({ slot }: { slot: SkillMarkdownSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);

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

  const skillDirRel =
    slot.mode === "edit" ? `.prismnext/agent/skills/${slot.skillId}` : null;
  const skillPath =
    projectRoot && skillDirRel
      ? `${projectRoot.replace(/[/\\]+$/, "")}/${skillDirRel}/SKILL.md`
      : null;

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
          const text = await window.electronAPI.agentReadBundledSkillMd(slot.skillId);
          if (text == null) throw new Error("bundled skill not found");
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
        const result = await window.electronAPI.fsRead(skillPath);
        const text = result?.content ?? "";
        setContent(text);
        setSavedContent(text);
      } catch {
        toast.error(t("settings.editor.skillMd.toast.loadFailed"));
        closePanel();
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slot.mode, slot.mode === "new" ? null : slot.skillId, skillPath, closePanel, t],
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

  // Resolve what "reset" means for this skill: restore the bundled copy when
  // one exists, reinstall from its registry/GitHub source otherwise. Custom
  // skills have no default to recover, so they get no reset.
  useEffect(() => {
    if (slot.mode !== "edit") {
      setResetSource(null);
      setBundledDefault(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const bundled = await window.electronAPI.agentReadBundledSkillMd(slot.skillId);
        if (cancelled) return;
        if (bundled != null) {
          setBundledDefault(bundled);
          setResetSource("bundled");
          return;
        }
        if (projectRoot) {
          const list = await window.electronAPI.agentListSkills(projectRoot);
          const info = list.find((s) => s.id === slot.skillId);
          if (!cancelled && info?.installOrigin) setResetSource("registry");
        }
      } catch {
        /* no reset source available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slot.mode, slot.mode === "new" ? null : slot.skillId, projectRoot]);

  const handleResetToDefault = async () => {
    if (!projectRoot || slot.mode !== "edit" || !resetSource) return;
    setResetting(true);
    try {
      if (resetSource === "bundled") {
        await window.electronAPI.agentInstallBundledSkill(projectRoot, slot.skillId);
      } else {
        await window.electronAPI.agentReinstallSkill(projectRoot, slot.skillId);
      }
      await window.electronAPI.chatPrewarm(projectRoot);
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
      const list = await window.electronAPI.agentListSkills(projectRoot);
      if (list.some((s) => s.id === validation.name)) {
        toast.error(t("settings.editor.skillMd.toast.exists", { name: validation.name }));
        return;
      }
    }

    setSaving(true);
    try {
      await window.electronAPI.agentInstallSkill(projectRoot, validation.name, content.trim());
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

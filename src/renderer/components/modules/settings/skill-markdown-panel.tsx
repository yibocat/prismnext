import { useCallback, useEffect, useState } from "react";
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
        toast.error("Failed to load SKILL.md.");
        closePanel();
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slot.mode, skillPath, closePanel],
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
  }, [loadContent, slot.mode, slot.mode === "edit" ? slot.skillId : null]);

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
        toast.error(`Skill "${validation.name}" already exists.`);
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
          ? `Created "${validation.name}" — start a new chat to use it.`
          : "Skill updated — start a new chat to pick up changes.",
      );
      closePanel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill.");
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Open a project to edit skills.
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
          <MarkdownContentPreview content={content} variant="skill" className="h-full" />
        )}
      </div>
    </div>
  );
}

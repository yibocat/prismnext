import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PuzzleIcon,
  PlusIcon,
  FileTextIcon,
  FolderOpenIcon,
  LibraryIcon,
  SquareArrowOutUpRightIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { revealProjectHiddenPath } from "@/lib/files/open-project-path";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useSkillsRefreshStore } from "@/lib/settings/skills-refresh";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";

const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5 line-clamp-2";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";

interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  skillDirRel: string;
  enabled: boolean;
  installOrigin?:
    | { adapter: "github"; repo: string; ref: string; path: string }
    | { adapter: "discovery"; indexUrl: string };
}

interface SkillUpdateRow {
  skillId: string;
  status: "current" | "update_available" | "source_missing" | "unknown";
  updateAvailable: boolean;
  installedVersion?: string;
  remoteVersion?: string;
  message?: string;
}

export function SkillsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const skillsRefreshTick = useSkillsRefreshStore((s) => s.tick);

  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatesBySkillId, setUpdatesBySkillId] = useState<Record<string, SkillUpdateRow>>({});
  const deleteConfirm = useInlineDeleteConfirm();

  const loadSkills = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoaded(false);
    try {
      if (!projectRoot) {
        setSkills([]);
        return;
      }
      const list = await window.electronAPI.agentListSkills(projectRoot);
      setSkills(list);
    } catch {
      setSkills([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadSkills({ silent: skillsRefreshTick > 0 });
  }, [loadSkills, skillsRefreshTick]);

  const toggleEnabled = async (skillId: string, enabled: boolean) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setSkills((current) =>
      current.map((s) => (s.id === skillId ? { ...s, enabled } : s)),
    );
    try {
      const result = await window.electronAPI.agentSetSkillEnabled(
        projectRoot,
        skillId,
        enabled,
      );
      if (result.skills) {
        setSkills(result.skills);
      }
    } catch {
      setSkills((current) =>
        current.map((s) => (s.id === skillId ? { ...s, enabled: !enabled } : s)),
      );
      toast.error(t("settings.skillsPage.toast.updateFailed"));
    }
  };

  const reinstallSkill = async (skill: InstalledSkill) => {
    if (!projectRoot || !skill.installOrigin) return;
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentReinstallSkill(projectRoot, skill.id);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadSkills();
      setUpdatesBySkillId((prev) => {
        const next = { ...prev };
        delete next[skill.id];
        return next;
      });
      toast.success(t("settings.skillsPage.toast.reinstalled", { name: skill.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reinstall failed.");
    } finally {
      setSaving(false);
    }
  };

  const checkForUpdates = async () => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setCheckingUpdates(true);
    try {
      const updates = await window.electronAPI.agentCheckSkillUpdates(projectRoot);
      const next: Record<string, SkillUpdateRow> = {};
      for (const row of updates) {
        next[row.skillId] = row;
      }
      setUpdatesBySkillId(next);
      const available = updates.filter((row) => row.updateAvailable).length;
      if (available > 0) {
        toast.info(t("settings.skillsPage.toast.updatesAvailable", { count: available }));
      } else if (updates.length > 0) {
        toast.success(t("settings.skillsPage.toast.upToDate"));
      } else {
        toast.message(t("settings.skillsPage.toast.noSources"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update check failed.");
    } finally {
      setCheckingUpdates(false);
    }
  };

  const deleteSkill = async (skillId: string) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentDeleteSkill(projectRoot, skillId);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadSkills();
      toast.success(t("settings.skillsPage.toast.removed", { name: skillId }));
    } finally {
      setSaving(false);
    }
  };

  const openSkillsFolder = () => {
    revealProjectHiddenPath(".prismnext/agent/skills");
  };

  const openCreateSkill = () => {
    openSettingsPanel({ kind: "skill-markdown", mode: "new" });
  };

  const openSkillLibrary = () => {
    openSettingsPanel({ kind: "skill-library" });
  };

  const openSkillMarkdown = (skill: InstalledSkill) => {
    deleteConfirm.clearPending();
    openSettingsPanel({
      kind: "skill-markdown",
      mode: "edit",
      skillId: skill.id,
      title: skill.name,
    });
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.skillsPage.title")}</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {t("settings.skillsPage.pageDesc")}
            </p>
          </div>
          {projectRoot && (
            <Button variant="outline" size="xs" className="shrink-0" onClick={openSkillsFolder}>
              <FolderOpenIcon className="size-3 mr-1" />
              Open folder
            </Button>
          )}
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <PuzzleIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.skillsPage.openProject")}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-2">
              Stored in{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">
                .prismnext/agent/skills/&lt;name&gt;/SKILL.md
              </code>
              . New chat tabs pick up changes.
            </p>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <p className={cn(CATEGORY_HEADER, "mb-0")}>{t("settings.skillsPage.installed")}</p>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={checkingUpdates || saving || skills.every((s) => !s.installOrigin)}
                    onClick={() => void checkForUpdates()}
                  >
                    <RefreshCwIcon className={cn("size-3 mr-1", checkingUpdates && "animate-spin")} />
                    {t("settings.skillsPage.checkUpdates")}
                  </Button>
                  <Button variant="outline" size="xs" onClick={openSkillLibrary}>
                    <LibraryIcon className="size-3 mr-1" />
                    {t("settings.skillsPage.install")}
                  </Button>
                  <Button variant="outline" size="xs" onClick={openCreateSkill}>
                    <PlusIcon className="size-3 mr-1" />
                    {t("settings.skillsPage.create")}
                  </Button>
                </div>
              </div>

              <div className={CARD}>
                {!loaded ? (
                  <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">
                    Loading…
                  </div>
                ) : skills.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <PuzzleIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                      {t("settings.skillsPage.empty")}
                    </p>
                    <p className="text-[length:var(--font-size-12)] text-muted-foreground/80">
                      Install from GitHub or publisher registries, or create your own SKILL.md.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button variant="outline" size="xs" onClick={openSkillLibrary}>
                        <LibraryIcon className="size-3 mr-1" />
                        {t("settings.skillsPage.install")}
                      </Button>
                      <Button variant="outline" size="xs" onClick={openCreateSkill}>
                        <FileTextIcon className="size-3 mr-1" />
                        {t("settings.skillsPage.create")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  skills.map((skill) => {
                    const update = updatesBySkillId[skill.id];
                    const hasUpdate = update?.updateAvailable === true;
                    return (
                    <div key={skill.id} className={ROW}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(ROW_LABEL, "font-mono")}>{skill.name}</span>
                          {!skill.enabled && (
                            <span className={cn(BADGE, "bg-muted/60 text-muted-foreground/70")}>
                              off
                            </span>
                          )}
                          {hasUpdate && (
                            <span className={cn(BADGE, "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>
                              update
                            </span>
                          )}
                        </div>
                        <p className={ROW_DESC}>
                          {hasUpdate && update?.message
                            ? update.message
                            : skill.description || skill.id}
                        </p>
                      </div>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={(v) => void toggleEnabled(skill.id, v)}
                      />
                      {skill.installOrigin && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-7 px-2 shrink-0 text-[length:var(--font-size-11)]"
                          disabled={saving}
                          onClick={() => void reinstallSkill(skill)}
                        >
                          {hasUpdate ? "Update" : "Reinstall"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        disabled={saving}
                        title="Open skill"
                        onClick={() => openSkillMarkdown(skill)}
                      >
                        <SquareArrowOutUpRightIcon className="size-3.5" />
                      </Button>
                      <InlineDeleteButton
                        itemId={skill.id}
                        pending={deleteConfirm.isPending(skill.id)}
                        disabled={saving}
                        onRequest={() => deleteConfirm.setPendingId(skill.id)}
                        onConfirm={() => void deleteSkill(skill.id)}
                      />
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

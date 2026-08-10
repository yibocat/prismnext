import { formatTokenCount } from "@shared/token-estimate";
import { useCallback, useEffect, useMemo, useState } from "react";
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
const SKILLS_PAGE_INITIAL_COUNT = 10;

interface InstalledSkill {
  fqid: string;
  id: string;
  name: string;
  description: string;
  skillDirRel: string;
  enabled: boolean;
  tokenCount: number;
  installOrigin?:
    | { adapter: "github"; repo: string; ref: string; path: string }
    | { adapter: "discovery"; indexUrl: string };
  origin: "bundled" | "registry" | "custom" | "plugin";
  originTeamName?: string;
  removable: boolean;
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
  const [showAllSkills, setShowAllSkills] = useState(false);
  const deleteConfirm = useInlineDeleteConfirm();

  const visibleSkills =
    showAllSkills || skills.length <= SKILLS_PAGE_INITIAL_COUNT
      ? skills
      : skills.slice(0, SKILLS_PAGE_INITIAL_COUNT);
  const hasMoreSkills = skills.length > SKILLS_PAGE_INITIAL_COUNT;

  // Group skills by owning pack (spec: core / 各 pack / 我的), unified origin
  // badge. Plugin skills group under their pack; bundled under core; everything
  // else (custom + registry installs) under "Mine". `scope` makes the layering
  // explicit: app-level (ships with / installed from packs) vs project-level
  // (this project's own content).
  const skillGroups = useMemo(() => {
    const CORE_KEY = "__core__";
    const MINE_KEY = "__mine__";
    const map = new Map<
      string,
      { key: string; label: string; scope: "app" | "project"; skills: InstalledSkill[] }
    >();
    const push = (key: string, label: string, scope: "app" | "project", skill: InstalledSkill) => {
      const entry = map.get(key) ?? { key, label, scope, skills: [] };
      entry.skills.push(skill);
      map.set(key, entry);
    };
    for (const s of visibleSkills) {
      if (s.origin === "plugin") {
        push(s.originTeamName ?? "pack", s.originTeamName ?? "pack", "app", s);
      } else if (s.origin === "bundled") {
        push(CORE_KEY, t("settings.skillsPage.group.core"), "app", s);
      } else {
        push(MINE_KEY, t("settings.skillsPage.group.mine"), "project", s);
      }
    }
    const rank = (key: string) =>
      key === CORE_KEY ? 0 : key === MINE_KEY ? 2 : 1;
    return [...map.values()].sort(
      (a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label),
    );
  }, [visibleSkills, t]);

  useEffect(() => {
    setShowAllSkills(false);
  }, [projectRoot]);

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

  const toggleEnabled = async (skill: InstalledSkill, enabled: boolean) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setSkills((current) =>
      current.map((s) => (s.fqid === skill.fqid ? { ...s, enabled } : s)),
    );
    try {
      const result = await window.electronAPI.agentSetSkillEnabled(
        projectRoot,
        skill.fqid,
        enabled,
      );
      if (result.skills) {
        setSkills(result.skills);
      }
    } catch {
      setSkills((current) =>
        current.map((s) => (s.fqid === skill.fqid ? { ...s, enabled: !enabled } : s)),
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

  const deleteSkill = async (skill: InstalledSkill) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentDeleteSkill(projectRoot, skill.fqid);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadSkills();
      toast.success(t("settings.skillsPage.toast.removed", { name: skill.id }));
    } finally {
      setSaving(false);
    }
  };

  const openSkillsFolder = () => {
    revealProjectHiddenPath(".prismnext/agent/local/skills");
  };

  const openCreateSkill = () => {
    openSettingsPanel({ kind: "skill-markdown", mode: "new" });
  };

  const openSkillLibrary = () => {
    openSettingsPanel({ kind: "skill-library" });
  };

  const openSkillMarkdown = (skill: InstalledSkill) => {
    deleteConfirm.clearPending();
    if (skill.removable) {
      openSettingsPanel({
        kind: "skill-markdown",
        mode: "edit",
        skillId: skill.id,
        title: skill.name,
      });
      return;
    }
    // pack 内容只读预览；非 core pack 用绝对路径直接读文件
    openSettingsPanel({
      kind: "skill-markdown",
      mode: "preview-bundled",
      skillId: skill.id,
      title: skill.name,
      absPath: skill.origin === "bundled" ? undefined : `${skill.skillDirRel}/SKILL.md`,
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
                .prismnext/agent/local/skills/&lt;name&gt;/SKILL.md
              </code>
              . Pack skills are referenced in place. New chat tabs pick up changes.
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
                  <>
                  {skillGroups.map((group) => (
                    <div key={group.key} className="divide-y divide-border">
                      <div className={cn(ROW, "!pb-1")}>
                        <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wide text-muted-foreground/70">
                          {group.label}
                        </p>
                        <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                          {group.scope === "app"
                            ? t("settings.skillsPage.scope.app")
                            : t("settings.skillsPage.scope.project")}
                        </span>
                      </div>
                      {group.skills.map((skill) => {
                        const update = updatesBySkillId[skill.id];
                        const hasUpdate = update?.updateAvailable === true;
                        return (
                        <div key={skill.fqid} className={ROW}>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn(ROW_LABEL, "font-mono")}>{skill.name}</span>
                              <span className="text-[length:var(--font-size-11)] text-muted-foreground/70 tabular-nums">
                                {t("settings.editor.promptStack.tokens", {
                                  count: formatTokenCount(skill.tokenCount),
                                })}
                              </span>
                              {!skill.enabled && (
                                <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                                  off
                                </span>
                              )}
                              {skill.origin === "custom" && (
                                <span className={cn(BADGE, "bg-secondary text-secondary-foreground")}>
                                  {t("settings.skillsPage.origin.custom")}
                                </span>
                              )}
                              {skill.origin === "bundled" && (
                                <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                                  {t("settings.skillsPage.origin.bundled")}
                                </span>
                              )}
                              {skill.origin === "plugin" && (
                                <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                                  {skill.originTeamName ?? "pack"}
                                </span>
                              )}
                              {hasUpdate && (
                                <span className={cn(BADGE, "bg-secondary text-warning")}>
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
                            onCheckedChange={(v) => void toggleEnabled(skill, v)}
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
                          {skill.removable && (
                            <InlineDeleteButton
                              itemId={skill.fqid}
                              pending={deleteConfirm.isPending(skill.fqid)}
                              disabled={saving}
                              onRequest={() => deleteConfirm.setPendingId(skill.fqid)}
                              onConfirm={() => void deleteSkill(skill)}
                            />
                          )}
                        </div>
                        );
                      })}
                    </div>
                  ))}
                  {hasMoreSkills && (
                    <div className="py-2.5 flex justify-center border-t border-border">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[length:var(--font-size-12)] text-muted-foreground"
                        onClick={() => setShowAllSkills((v) => !v)}
                      >
                        {showAllSkills
                          ? t("settings.skillsPage.showLess")
                          : t("settings.skillsPage.showAll", { count: skills.length })}
                      </Button>
                    </div>
                  )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

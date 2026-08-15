// Skills settings — flat SETTINGS_CARD list (name · tokens · team · description).
// Core / store skills are browse-only; self-created / self-installed can be deleted.
// No per-skill enable Switch — availability is team Skills allowlist / presence.
import { formatTokenCount } from "@shared/token-estimate";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PuzzleIcon,
  PlusIcon,
  FileTextIcon,
  FolderOpenIcon,
  LibraryIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { revealProjectHiddenPath } from "@/lib/files/open-project-path";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useSkillsRefreshStore } from "@/lib/settings/skills-refresh";
import { teamDisplayName } from "@/lib/teams/team-display-name";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import {
  SETTINGS_CARD as CARD,
  SETTINGS_CATEGORY_HEADER as CATEGORY_HEADER,
  SETTINGS_ROW as ROW,
  SETTINGS_ROW_DESC as ROW_DESC,
  SETTINGS_ROW_LABEL as ROW_LABEL,
} from "./settings-tokens";
import type { AssetViewV2 } from "@shared/teams/view";
import {
  matchesAgentAssetQuery,
  type AgentAssetPaneProps,
} from "./agent-assets-shared";

const SKILLS_LIST_PREVIEW = 15;

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

export function SkillsSettings({
  embedded = false,
  searchQuery = "",
}: AgentAssetPaneProps = {}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const skillsRefreshTick = useSkillsRefreshStore((s) => s.tick);

  const [assets, setAssets] = useState<AssetViewV2[]>([]);
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatesBySkillId, setUpdatesBySkillId] = useState<Record<string, SkillUpdateRow>>({});
  const [listExpanded, setListExpanded] = useState(false);
  const deleteConfirm = useInlineDeleteConfirm();

  const skillByFqid = useMemo(() => {
    const map = new Map<string, InstalledSkill>();
    for (const s of skills) map.set(s.fqid, s);
    return map;
  }, [skills]);

  const sortedAssets = useMemo(() => {
    const sorted = [...assets].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId),
    );
    return sorted.filter((a) => {
      const skill = skillByFqid.get(a.fqid);
      return matchesAgentAssetQuery(
        searchQuery,
        a.name,
        a.id,
        a.fqid,
        a.description,
        a.teamId,
        a.origin.teamName,
        skill?.description,
        skill?.name,
      );
    });
  }, [assets, searchQuery, skillByFqid]);

  const visibleAssets = useMemo(() => {
    if (listExpanded || sortedAssets.length <= SKILLS_LIST_PREVIEW) {
      return sortedAssets;
    }
    return sortedAssets.slice(0, SKILLS_LIST_PREVIEW);
  }, [sortedAssets, listExpanded]);

  const hiddenCount = Math.max(0, sortedAssets.length - SKILLS_LIST_PREVIEW);
  const unfilteredCount = assets.length;

  const loadAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoaded(false);
    try {
      if (!projectRoot) {
        setAssets([]);
        setSkills([]);
        return;
      }
      const [assetList, skillList] = await Promise.all([
        window.electronAPI.teamsListAssets(projectRoot, "skill"),
        window.electronAPI.agentListSkills(projectRoot),
      ]);
      setAssets(assetList);
      setSkills(skillList);
    } catch {
      setAssets([]);
      setSkills([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadAll({ silent: skillsRefreshTick > 0 });
  }, [loadAll, skillsRefreshTick]);

  useEffect(() => {
    setListExpanded(false);
  }, [projectRoot]);

  useOnSettingsEditorKindsClosed(["skill-markdown", "skill-library"], () => {
    void loadAll({ silent: true });
  });

  const reinstallSkill = async (skill: InstalledSkill) => {
    if (!projectRoot || !skill.installOrigin) return;
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentReinstallSkill(projectRoot, skill.id);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadAll();
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
      for (const row of updates) next[row.skillId] = row;
      setUpdatesBySkillId(next);
      const available = updates.filter((row) => row.updateAvailable).length;
      if (available > 0) toast.info(t("settings.skillsPage.toast.updatesAvailable", { count: available }));
      else if (updates.length > 0) toast.success(t("settings.skillsPage.toast.upToDate"));
      else toast.message(t("settings.skillsPage.toast.noSources"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update check failed.");
    } finally {
      setCheckingUpdates(false);
    }
  };

  const deleteSkill = async (fqid: string) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentDeleteSkill(projectRoot, fqid);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadAll();
      toast.success(t("settings.skillsPage.toast.removed", { name: fqid.split(":").pop() }));
    } finally {
      setSaving(false);
    }
  };

  const openSkillsFolder = () => {
    revealProjectHiddenPath(".prismnext/agent/teams/project.local/skills");
  };

  const openCreateSkill = () => {
    openSettingsPanel({ kind: "skill-markdown", mode: "new" });
  };

  const openSkillLibrary = () => {
    openSettingsPanel({ kind: "skill-library" });
  };

  const openSkillMarkdown = (asset: AssetViewV2, skill?: InstalledSkill) => {
    deleteConfirm.clearPending();
    const skillId = skill?.id ?? asset.id;
    const title = skill?.name ?? asset.name;
    const removable = skill?.removable ?? asset.editable;
    if (removable) {
      openSettingsPanel({
        kind: "skill-markdown",
        mode: "edit",
        skillId,
        title,
        teamId: asset.teamId,
      });
      return;
    }
    const absPath =
      skill?.origin === "bundled"
        ? undefined
        : skill?.skillDirRel
          ? `${skill.skillDirRel.replace(/[/\\]+$/, "")}/SKILL.md`
          : asset.dir
            ? `${asset.dir.replace(/[/\\]+$/, "")}/SKILL.md`
            : undefined;
    openSettingsPanel({
      kind: "skill-markdown",
      mode: "preview-bundled",
      skillId,
      title,
      absPath,
    });
  };

  const listBody = !projectRoot ? (
    <div className={cn(CARD, "min-w-0 !divide-y-0")}>
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <PuzzleIcon className="size-8 text-muted-foreground/30" />
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.skillsPage.openProject")}
        </p>
      </div>
    </div>
  ) : (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className={cn(CATEGORY_HEADER, "mb-0")}>{t("settings.skillsPage.installed")}</p>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="xs"
            className="px-2"
            disabled={checkingUpdates || saving || skills.every((s) => !s.installOrigin)}
            onClick={() => void checkForUpdates()}
            title={t("settings.skillsPage.checkUpdates")}
            aria-label={t("settings.skillsPage.checkUpdates")}
          >
            <RefreshCwIcon className={cn("size-3.5", checkingUpdates && "animate-spin")} />
          </Button>
          <Button variant="outline" size="xs" onClick={openSkillLibrary}>
            <LibraryIcon className="size-3 mr-1" />
            {t("settings.skillsPage.install")}
          </Button>
          <Button variant="outline" size="xs" onClick={openCreateSkill}>
            <PlusIcon className="size-3 mr-1" />
            {t("settings.skillsPage.create")}
          </Button>
          <Button variant="outline" size="xs" onClick={openSkillsFolder}>
            <FolderOpenIcon className="size-3 mr-1" />
            {t("settings.skillsPage.openFolder")}
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className={cn(CARD, "py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>
          {t("common.loading")}
        </div>
      ) : unfilteredCount === 0 ? (
        <div className={cn(CARD, "!divide-y-0")}>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <PuzzleIcon className="size-8 text-muted-foreground/30" />
            <p className="text-[length:var(--font-size-13)] text-muted-foreground">
              {t("settings.skillsPage.empty")}
            </p>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground/80">
              {t("settings.skillsPage.emptyHint")}
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
        </div>
      ) : sortedAssets.length === 0 ? (
        <div className={cn(CARD, "min-w-0 py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>
          {t("settings.agentAssets.noMatches")}
        </div>
      ) : (
        <div className={cn(CARD, "min-w-0 overflow-hidden")}>
          {visibleAssets.map((asset) => {
            const skill = skillByFqid.get(asset.fqid);
            const canDelete = Boolean(skill?.removable);
            const update = skill ? updatesBySkillId[skill.id] : undefined;
            const hasUpdate = update?.updateAvailable === true;
            const teamLabel = teamDisplayName(
              asset.teamId,
              asset.origin.teamName,
              t,
            );
            const description = (skill?.description || asset.description || "").trim();

            return (
              <div key={asset.fqid} className={cn(ROW, "min-w-0 items-start")}>
                <button
                  type="button"
                  className="min-w-0 flex-1 pr-2 text-left"
                  disabled={saving}
                  onClick={() => openSkillMarkdown(asset, skill)}
                >
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn(ROW_LABEL, "min-w-0 max-w-full truncate font-mono")}>
                      {asset.name}
                    </span>
                    {skill && (
                      <span className="shrink-0 text-[length:var(--font-size-11)] tabular-nums text-muted-foreground">
                        {t("settings.editor.promptStack.tokens", {
                          count: formatTokenCount(skill.tokenCount),
                        })}
                      </span>
                    )}
                    <span
                      className="min-w-0 max-w-full truncate text-[length:var(--font-size-11)] text-muted-foreground"
                      title={teamLabel}
                    >
                      {teamLabel}
                    </span>
                    {hasUpdate && (
                      <span className="shrink-0 text-[length:var(--font-size-11)] text-warning">
                        {t("settings.skillsPage.updateAvailable")}
                      </span>
                    )}
                  </div>
                  {description ? (
                    <p className={cn(ROW_DESC, "line-clamp-2 break-words")} title={description}>
                      {description}
                    </p>
                  ) : null}
                </button>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {skill?.installOrigin && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-7 px-2 shrink-0 text-[length:var(--font-size-11)]"
                      disabled={saving}
                      onClick={() => void reinstallSkill(skill)}
                    >
                      {hasUpdate
                        ? t("settings.skillsPage.update")
                        : t("settings.skillsPage.reinstall")}
                    </Button>
                  )}
                  {canDelete && (
                    <InlineDeleteButton
                      itemId={asset.fqid}
                      pending={deleteConfirm.isPending(asset.fqid)}
                      disabled={saving}
                      onRequest={() => deleteConfirm.setPendingId(asset.fqid)}
                      onConfirm={() => void deleteSkill(asset.fqid)}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {!listExpanded && hiddenCount > 0 && (
            <button
              type="button"
              className={cn(
                ROW,
                "w-full justify-center text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setListExpanded(true)}
            >
              {t("settings.skillsPage.loadMore", { count: hiddenCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return <div className="min-w-0 space-y-6">{listBody}</div>;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6 px-4 py-8 sm:px-8">
        <div className="min-w-0">
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            {t("settings.skillsPage.title")}
          </h2>
          <p className="mt-0.5 text-[length:var(--font-dialog-label)] text-muted-foreground">
            {t("settings.skillsPage.pageDesc")}
          </p>
        </div>
        {listBody}
      </div>
    </div>
  );
}

// Skills settings — uses AssetGroupList (design §8.4) as the list component,
// with teamsListAssets as the primary data source. The legacy agentListSkills
// is kept as a secondary source for token counts / update checks / install
// origins, indexed by fqid and passed through renderMeta / renderActions.
// Standard settings shell: max-w-3xl + SETTINGS_CARD + shadcn controls.
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
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import {
  SETTINGS_CARD as CARD,
  SETTINGS_CATEGORY_HEADER as CATEGORY_HEADER,
} from "./settings-tokens";
import { AssetGroupList } from "../teams/asset-group-list";
import type { AssetViewV2 } from "@shared/teams/view";

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

  // Primary data: AssetViewV2[] from the new resolver (drives AssetGroupList).
  const [assets, setAssets] = useState<AssetViewV2[]>([]);
  // Secondary data: InstalledSkill[] from agentListSkills (for token counts,
  // update checks, install origins — indexed by fqid).
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatesBySkillId, setUpdatesBySkillId] = useState<Record<string, SkillUpdateRow>>({});
  const deleteConfirm = useInlineDeleteConfirm();

  // Index secondary data by fqid for O(1) lookup in renderMeta/renderActions.
  const skillByFqid = useMemo(() => {
    const map = new Map<string, InstalledSkill>();
    for (const s of skills) map.set(s.fqid, s);
    return map;
  }, [skills]);

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

  const handleSetEnabled = useCallback(async (fqid: string, enabled: boolean | null) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    // Optimistic: flip the asset locally.
    setAssets((cur) => cur.map((a) => (a.fqid === fqid ? { ...a, enabled: enabled ?? true } : a)));
    try {
      await window.electronAPI.teamsSetAssetEnabled(projectRoot, fqid, enabled, "project");
      await loadAll({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.skillsPage.toast.updateFailed"));
      await loadAll({ silent: true });
    }
  }, [projectRoot, deleteConfirm, loadAll, t]);

  const reinstallSkill = async (skill: InstalledSkill) => {
    if (!projectRoot || !skill.installOrigin) return;
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentReinstallSkill(projectRoot, skill.id);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadAll();
      setUpdatesBySkillId((prev) => { const next = { ...prev }; delete next[skill.id]; return next; });
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
      openSettingsPanel({ kind: "skill-markdown", mode: "edit", skillId: skill.id, title: skill.name });
      return;
    }
    openSettingsPanel({
      kind: "skill-markdown", mode: "preview-bundled", skillId: skill.id, title: skill.name,
      absPath: skill.origin === "bundled" ? undefined : `${skill.skillDirRel}/SKILL.md`,
    });
  };

  // renderMeta: token count + update badge (from secondary data).
  const renderMeta = (asset: AssetViewV2) => {
    const skill = skillByFqid.get(asset.fqid);
    const update = skill ? updatesBySkillId[skill.id] : undefined;
    const hasUpdate = update?.updateAvailable === true;
    return (
      <span className="flex items-center gap-2">
        {skill && (
          <span className="tabular-nums">
            {t("settings.editor.promptStack.tokens", { count: formatTokenCount(skill.tokenCount) })}
          </span>
        )}
        {hasUpdate && (
          <span className="text-warning">{t("settings.skillsPage.updateAvailable")}</span>
        )}
      </span>
    );
  };

  // renderActions: reinstall / open / delete (from secondary data).
  const renderActions = (asset: AssetViewV2) => {
    const skill = skillByFqid.get(asset.fqid);
    if (!skill) return null;
    const update = updatesBySkillId[skill.id];
    const hasUpdate = update?.updateAvailable === true;
    return (
      <div className="flex items-center gap-2 shrink-0">
        {skill.installOrigin && (
          <Button variant="ghost" size="xs" className="h-7 px-2 shrink-0 text-[length:var(--font-size-11)]"
            disabled={saving} onClick={() => void reinstallSkill(skill)}>
            {hasUpdate ? "Update" : "Reinstall"}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={saving}
          title="Open skill" onClick={() => openSkillMarkdown(skill)}>
          <SquareArrowOutUpRightIcon className="size-3.5" />
        </Button>
        {skill.removable && (
          <InlineDeleteButton itemId={asset.fqid} pending={deleteConfirm.isPending(asset.fqid)} disabled={saving}
            onRequest={() => deleteConfirm.setPendingId(asset.fqid)}
            onConfirm={() => void deleteSkill(asset.fqid)} />
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.skillsPage.title")}</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">{t("settings.skillsPage.pageDesc")}</p>
          </div>
          {projectRoot && (
            <Button variant="outline" size="xs" className="shrink-0" onClick={openSkillsFolder}>
              <FolderOpenIcon className="size-3 mr-1" />Open folder
            </Button>
          )}
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <PuzzleIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.skillsPage.openProject")}</p>
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
                  <Button variant="outline" size="xs"
                    disabled={checkingUpdates || saving || skills.every((s) => !s.installOrigin)}
                    onClick={() => void checkForUpdates()}>
                    <RefreshCwIcon className={cn("size-3 mr-1", checkingUpdates && "animate-spin")} />
                    {t("settings.skillsPage.checkUpdates")}
                  </Button>
                  <Button variant="outline" size="xs" onClick={openSkillLibrary}>
                    <LibraryIcon className="size-3 mr-1" />{t("settings.skillsPage.install")}
                  </Button>
                  <Button variant="outline" size="xs" onClick={openCreateSkill}>
                    <PlusIcon className="size-3 mr-1" />{t("settings.skillsPage.create")}
                  </Button>
                </div>
              </div>

              {!loaded ? (
                <div className={cn(CARD, "py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>
                  {t("common.loading")}
                </div>
              ) : assets.length === 0 ? (
                <div className={cn(CARD, "!divide-y-0")}>
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <PuzzleIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.skillsPage.empty")}</p>
                    <p className="text-[length:var(--font-size-12)] text-muted-foreground/80">
                      Install from GitHub or publisher registries, or create your own SKILL.md.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button variant="outline" size="xs" onClick={openSkillLibrary}>
                        <LibraryIcon className="size-3 mr-1" />{t("settings.skillsPage.install")}
                      </Button>
                      <Button variant="outline" size="xs" onClick={openCreateSkill}>
                        <FileTextIcon className="size-3 mr-1" />{t("settings.skillsPage.create")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <AssetGroupList
                  assets={assets}
                  onSetEnabled={handleSetEnabled}
                  renderMeta={renderMeta}
                  renderActions={renderActions}
                  emptyHint={t("settings.skillsPage.empty")}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

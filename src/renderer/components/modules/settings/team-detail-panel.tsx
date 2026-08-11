// Team detail panel — right-side inventory for a team. Lead / subagent rows
// open their editor tabs; the subagent list can pull in external roster members
// via a trailing "+" row (keeps the same bordered list chrome).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PackageIcon, PlusIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { useTeamsStore } from "@/stores/teams-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { PackIcon } from "../teams/team-icon";
import { OriginChip } from "../teams/origin-chip";
import { ProBadge } from "../teams/pro-badge";
import { ScopeChip } from "../teams/scope-chip";
import { OverrideDot } from "../teams/override-dot";
import {
  APP_COMMANDS_OWNER_ID,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  type AssetKind,
} from "@shared/teams/types";
import { isProjectEnableOverridden } from "@shared/teams/state";
import type { AssetViewV2, RosterView } from "@shared/teams/view";
import { teamDisplayName } from "@/lib/teams/team-display-name";

type TeamDetailSlot = Extract<SettingsPanelSlot, { kind: "team-detail" }>;

interface PackContentEntry {
  kind: AssetKind;
  id: string;
  name: string;
  description: string;
}

interface DisplaySubagent {
  fqid: string;
  id: string;
  name: string;
  description: string;
  /** Born in this team vs pulled in via roster. */
  owned: boolean;
  asset: AssetViewV2 | null;
}

type DisplaySkill = DisplaySubagent;
type DisplayCommand = DisplaySubagent;

const KIND_LABEL_KEYS: Record<AssetKind, string> = {
  orchestrator: "settings.teams.kinds.lead",
  subagent: "settings.teams.kinds.subagent",
  skill: "settings.teams.kinds.skill",
  command: "settings.teams.kinds.command",
  mcp: "settings.teams.kinds.mcp",
};

/** Clickable inventory row — muted → full foreground on hover, no fill. */
const CLICK_ROW =
  "group w-full px-3 py-2 text-left transition-colors text-muted-foreground hover:text-foreground";
const CLICK_ROW_TITLE =
  "text-[length:var(--font-size-12)] transition-colors text-muted-foreground group-hover:text-foreground";
const CLICK_ROW_DESC =
  "text-[length:var(--font-size-11)] text-muted-foreground mt-0.5 transition-colors group-hover:text-foreground";

function teamIdOfFqid(fqid: string): string {
  const idx = fqid.indexOf(":");
  return idx > 0 ? fqid.slice(0, idx) : fqid;
}

export function TeamDetailPanel({ slot }: { slot: TeamDetailSlot }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const license = useProLicenseStore((s) => s.license);
  const pack = useTeamsStore((s) =>
    s.catalog.find((p) => p.manifest.id === slot.teamId) ?? null,
  );
  const activeTeamId = useTeamsStore((s) => s.activeTeamId);
  const [contents, setContents] = useState<PackContentEntry[]>([]);
  const [subagents, setSubagents] = useState<AssetViewV2[]>([]);
  const [skills, setSkills] = useState<AssetViewV2[]>([]);
  const [commands, setCommands] = useState<AssetViewV2[]>([]);
  const [mcps, setMcps] = useState<AssetViewV2[]>([]);
  const [orchestrators, setOrchestrators] = useState<AssetViewV2[]>([]);
  const [roster, setRoster] = useState<RosterView | null>(null);
  const [skillsRoster, setSkillsRoster] = useState<RosterView | null>(null);
  const [commandsRoster, setCommandsRoster] = useState<RosterView | null>(null);
  const [pickingExternal, setPickingExternal] = useState(false);
  const [pickingExternalSkill, setPickingExternalSkill] = useState(false);
  const [pickingExternalCommand, setPickingExternalCommand] = useState(false);
  const [busy, setBusy] = useState(false);
  const deleteConfirm = useInlineDeleteConfirm();

  const load = useCallback(async () => {
    if (!projectRoot) return;
    try {
      await useTeamsStore.getState().load(projectRoot, { force: true });
      const [
        nextContents,
        nextSubagents,
        nextSkills,
        nextCommands,
        nextMcps,
        nextOrchs,
        nextRoster,
        nextSkillsRoster,
        nextCommandsRoster,
      ] =
        await Promise.all([
          window.electronAPI.teamsGetTeamContents(slot.teamId, projectRoot),
          window.electronAPI.teamsListAssets(projectRoot, "subagent"),
          window.electronAPI.teamsListAssets(projectRoot, "skill"),
          window.electronAPI.teamsListAssets(projectRoot, "command"),
          window.electronAPI.teamsListAssets(projectRoot, "mcp"),
          window.electronAPI.teamsListAssets(projectRoot, "orchestrator"),
          window.electronAPI.teamsGetRoster(projectRoot, slot.teamId),
          window.electronAPI.teamsGetSkillsRoster(projectRoot, slot.teamId),
          window.electronAPI.teamsGetCommandsRoster(projectRoot, slot.teamId),
        ]);
      setContents(nextContents);
      setSubagents(nextSubagents);
      setSkills(nextSkills);
      setCommands(nextCommands);
      setMcps(nextMcps);
      setOrchestrators(nextOrchs);
      setRoster(nextRoster);
      setSkillsRoster(nextSkillsRoster);
      setCommandsRoster(nextCommandsRoster);
    } catch {
      setContents([]);
      setSubagents([]);
      setSkills([]);
      setCommands([]);
      setMcps([]);
      setOrchestrators([]);
      setRoster(null);
      setSkillsRoster(null);
      setCommandsRoster(null);
    }
  }, [projectRoot, slot.teamId]);

  useEffect(() => {
    void load();
  }, [load, license]);

  // License revoked while detail is open → close; manage from list / About.
  useEffect(() => {
    if (pack?.locked) closeSettingsPanel();
  }, [pack?.locked]);

  useEffect(() => {
    setPickingExternal(false);
    setPickingExternalSkill(false);
    setPickingExternalCommand(false);
  }, [slot.teamId]);

  const byFqid = useMemo(() => {
    const map = new Map<string, AssetViewV2>();
    for (const s of subagents) map.set(s.fqid, s);
    for (const s of skills) map.set(s.fqid, s);
    for (const c of commands) map.set(c.fqid, c);
    for (const o of orchestrators) map.set(o.fqid, o);
    return map;
  }, [subagents, skills, commands, orchestrators]);
  const ownedSubagents = useMemo(
    () => contents.filter((c) => c.kind === "subagent"),
    [contents],
  );

  const displaySubagents = useMemo<DisplaySubagent[]>(() => {
    const seen = new Set<string>();
    const out: DisplaySubagent[] = [];
    for (const c of ownedSubagents) {
      const fqid = `${slot.teamId}:${c.id}`;
      const asset = byFqid.get(fqid) ?? subagents.find((s) => s.teamId === slot.teamId && s.id === c.id) ?? null;
      const resolvedFqid = asset?.fqid ?? fqid;
      seen.add(resolvedFqid);
      out.push({
        fqid: resolvedFqid,
        id: c.id,
        name: asset?.name ?? (c.name || c.id),
        description: asset?.description ?? c.description,
        owned: true,
        asset,
      });
    }
    // Resolver list may see owned assets before catalog contents catch up.
    for (const asset of subagents) {
      if (asset.teamId !== slot.teamId || seen.has(asset.fqid)) continue;
      seen.add(asset.fqid);
      out.push({
        fqid: asset.fqid,
        id: asset.id,
        name: asset.name,
        description: asset.description,
        owned: true,
        asset,
      });
    }
    // External members only matter in explicit list mode (mode "all" already
    // includes everyone — no need to duplicate them in this team's inventory).
    if (roster?.spec.mode === "list") {
      for (const entry of roster.entries) {
        if (seen.has(entry.fqid)) continue;
        if (teamIdOfFqid(entry.fqid) === slot.teamId) continue;
        const asset = byFqid.get(entry.fqid) ?? null;
        seen.add(entry.fqid);
        out.push({
          fqid: entry.fqid,
          id: asset?.id ?? entry.fqid,
          name: entry.name,
          description: asset?.description ?? "",
          owned: false,
          asset,
        });
      }
    }
    return out;
  }, [ownedSubagents, roster, slot.teamId, byFqid, subagents]);

  const externalCandidates = useMemo(
    () => subagents
      .filter((s) => s.teamId !== slot.teamId && s.enabled)
      .filter((s) => !displaySubagents.some((d) => d.fqid === s.fqid))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [subagents, slot.teamId, displaySubagents],
  );

  const ownedSkills = useMemo(
    () => contents.filter((c) => c.kind === "skill"),
    [contents],
  );

  const displaySkills = useMemo<DisplaySkill[]>(() => {
    const seen = new Set<string>();
    const out: DisplaySkill[] = [];
    for (const c of ownedSkills) {
      const fqid = `${slot.teamId}:${c.id}`;
      const asset =
        byFqid.get(fqid)
        ?? skills.find((s) => s.teamId === slot.teamId && s.id === c.id)
        ?? null;
      const resolvedFqid = asset?.fqid ?? fqid;
      seen.add(resolvedFqid);
      out.push({
        fqid: resolvedFqid,
        id: c.id,
        name: asset?.name ?? (c.name || c.id),
        description: asset?.description ?? c.description,
        owned: true,
        asset,
      });
    }
    for (const asset of skills) {
      if (asset.teamId !== slot.teamId || seen.has(asset.fqid)) continue;
      seen.add(asset.fqid);
      out.push({
        fqid: asset.fqid,
        id: asset.id,
        name: asset.name,
        description: asset.description,
        owned: true,
        asset,
      });
    }
    if (skillsRoster?.spec.mode === "list") {
      for (const entry of skillsRoster.entries) {
        if (seen.has(entry.fqid)) continue;
        if (teamIdOfFqid(entry.fqid) === slot.teamId) continue;
        const asset = byFqid.get(entry.fqid) ?? null;
        seen.add(entry.fqid);
        out.push({
          fqid: entry.fqid,
          id: asset?.id ?? entry.fqid,
          name: entry.name,
          description: asset?.description ?? "",
          owned: false,
          asset,
        });
      }
    }
    return out;
  }, [ownedSkills, skillsRoster, slot.teamId, byFqid, skills]);

  // Writable teams (Project / Common / user-created): "+" is for pack skills
  // (Core, Pro, store, installed) — hangar/self-installed skills are owned
  // content on their birth team, not pulled in via "+".
  // Pack teams may still "+" hangar skills onto their allowlist.
  const externalSkillCandidates = useMemo(() => {
    const packOnly = Boolean(pack?.writable);
    return skills
      .filter((s) => s.teamId !== slot.teamId && s.enabled)
      .filter((s) => !displaySkills.some((d) => d.fqid === s.fqid))
      .filter((s) => (packOnly ? !s.editable : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [skills, slot.teamId, displaySkills, pack?.writable]);

  const ownedCommands = useMemo(
    () => contents.filter((c) => c.kind === "command"),
    [contents],
  );

  const displayCommands = useMemo<DisplayCommand[]>(() => {
    const seen = new Set<string>();
    const out: DisplayCommand[] = [];
    for (const c of ownedCommands) {
      const fqid = `${slot.teamId}:${c.id}`;
      const asset =
        byFqid.get(fqid)
        ?? commands.find((entry) => entry.teamId === slot.teamId && entry.id === c.id)
        ?? null;
      const resolvedFqid = asset?.fqid ?? fqid;
      seen.add(resolvedFqid);
      out.push({
        fqid: resolvedFqid,
        id: c.id,
        name: asset?.name ?? (c.name || c.id),
        description: asset?.description ?? c.description,
        owned: true,
        asset,
      });
    }
    for (const asset of commands) {
      if (asset.teamId !== slot.teamId || seen.has(asset.fqid)) continue;
      seen.add(asset.fqid);
      out.push({
        fqid: asset.fqid,
        id: asset.id,
        name: asset.name,
        description: asset.description,
        owned: true,
        asset,
      });
    }
    if (commandsRoster?.spec.mode === "list") {
      for (const entry of commandsRoster.entries) {
        if (seen.has(entry.fqid)) continue;
        if (teamIdOfFqid(entry.fqid) === slot.teamId) continue;
        const asset = byFqid.get(entry.fqid) ?? null;
        seen.add(entry.fqid);
        out.push({
          fqid: entry.fqid,
          id: asset?.id ?? entry.fqid,
          name: entry.name,
          description: asset?.description ?? "",
          owned: false,
          asset,
        });
      }
    }
    return out;
  }, [ownedCommands, commandsRoster, slot.teamId, byFqid, commands]);

  const externalCommandCandidates = useMemo(() => {
    const packOnly = Boolean(pack?.writable);
    return commands
      .filter((c) => c.teamId !== slot.teamId && c.teamId !== APP_COMMANDS_OWNER_ID && c.enabled)
      .filter((c) => !displayCommands.some((d) => d.fqid === c.fqid))
      .filter((c) => (packOnly ? !c.editable : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [commands, slot.teamId, displayCommands, pack?.writable]);

  const leadAsset = useMemo(
    () => orchestrators.find((o) => o.teamId === slot.teamId) ?? null,
    [orchestrators, slot.teamId],
  );

  const openLead = (entry: PackContentEntry) => {
    const asset = leadAsset
      ?? byFqid.get(`${slot.teamId}:${entry.id}`)
      ?? orchestrators.find((o) => o.id === entry.id)
      ?? null;
    const ref = asset?.fqid || asset?.runtimeName || `${slot.teamId}:${entry.id}`;
    const builtin = !(pack?.writable);
    openSettingsPanel(builtin
      ? { kind: "agent-orchestrator", mode: "installed", orchestratorId: ref, title: entry.name || entry.id }
      : { kind: "agent-orchestrator", mode: "edit", orchestratorId: ref, title: entry.name || entry.id });
  };

  const openSubagent = (row: DisplaySubagent) => {
    const ref = row.asset?.fqid || row.asset?.runtimeName || row.fqid;
    const team = useTeamsStore.getState().catalog.find((p) => p.manifest.id === teamIdOfFqid(row.fqid));
    const builtin = !(team?.writable ?? pack?.writable);
    openSettingsPanel(builtin
      ? { kind: "agent-expert", mode: "installed", expertId: ref, title: row.name }
      : { kind: "agent-expert", mode: "edit", expertId: ref, title: row.name });
  };

  const saveRosterMembers = async (members: string[]) => {
    if (!projectRoot || !roster) return;
    setBusy(true);
    try {
      await window.electronAPI.teamsSaveAssetOverride(
        projectRoot,
        roster.orchestratorFqid,
        { allowedExperts: members },
        "project",
      );
      await load();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  const addExternalToRoster = async (fqid: string) => {
    if (!roster) {
      toast.error(t("settings.teams.roster.noLead"));
      return;
    }
    const ownedFqids = displaySubagents.filter((d) => d.owned).map((d) => d.fqid);
    let members: string[];
    if (roster.spec.mode === "list") {
      const current = roster.spec.members.filter((m) => m !== "@team");
      const hasTeamRef = roster.spec.members.includes("@team");
      members = hasTeamRef
        ? ["@team", ...current.filter((m) => teamIdOfFqid(m) !== slot.teamId), fqid]
        : [...new Set([...current, ...ownedFqids, fqid])];
    } else {
      // Leaving "all" → pin this team's agents + the chosen external.
      members = ["@team", fqid];
    }
    await saveRosterMembers(members);
  };

  const removeExternalFromRoster = async (fqid: string) => {
    if (!roster || roster.spec.mode !== "list") return;
    const next = roster.spec.members.filter((m) => m !== fqid);
    await saveRosterMembers(next);
  };

  const saveSkillsRosterMembers = async (members: string[]) => {
    if (!projectRoot || !skillsRoster) return;
    setBusy(true);
    try {
      await window.electronAPI.teamsSaveAssetOverride(
        projectRoot,
        skillsRoster.orchestratorFqid,
        { allowedSkills: members },
        "project",
      );
      await load();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  const addExternalSkill = async (fqid: string) => {
    // Leadless teams get a sentinel `${teamId}:` orchestratorFqid — refuse save.
    if (!skillsRoster?.orchestratorFqid || skillsRoster.orchestratorFqid.endsWith(":")) {
      toast.error(t("settings.teams.roster.noLead"));
      return;
    }
    const ownedFqids = displaySkills.filter((d) => d.owned).map((d) => d.fqid);
    let members: string[];
    if (skillsRoster.spec.mode === "list") {
      const current = skillsRoster.spec.members.filter((m) => m !== "@team");
      const hasTeamRef = skillsRoster.spec.members.includes("@team");
      members = hasTeamRef
        ? ["@team", ...current.filter((m) => teamIdOfFqid(m) !== slot.teamId), fqid]
        : [...new Set([...current, ...ownedFqids, fqid])];
    } else {
      members = ["@team", fqid];
    }
    await saveSkillsRosterMembers(members);
    setPickingExternalSkill(false);
  };

  const removeExternalSkill = async (fqid: string) => {
    if (!skillsRoster || skillsRoster.spec.mode !== "list") return;
    const next = skillsRoster.spec.members.filter((m) => m !== fqid);
    await saveSkillsRosterMembers(next);
  };

  const saveCommandsRosterMembers = async (members: string[]) => {
    if (!projectRoot || !commandsRoster) return;
    setBusy(true);
    try {
      await window.electronAPI.teamsSaveAssetOverride(
        projectRoot,
        commandsRoster.orchestratorFqid,
        { allowedCommands: members },
        "project",
      );
      await load();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  const addExternalCommand = async (fqid: string) => {
    if (!commandsRoster?.orchestratorFqid || commandsRoster.orchestratorFqid.endsWith(":")) {
      toast.error(t("settings.teams.roster.noLead"));
      return;
    }
    const ownedFqids = displayCommands.filter((d) => d.owned).map((d) => d.fqid);
    let members: string[];
    if (commandsRoster.spec.mode === "list") {
      const current = commandsRoster.spec.members.filter((m) => m !== "@team");
      const hasTeamRef = commandsRoster.spec.members.includes("@team");
      members = hasTeamRef
        ? ["@team", ...current.filter((m) => teamIdOfFqid(m) !== slot.teamId), fqid]
        : [...new Set([...current, ...ownedFqids, fqid])];
    } else {
      members = ["@team", fqid];
    }
    await saveCommandsRosterMembers(members);
    setPickingExternalCommand(false);
  };

  const removeExternalCommand = async (fqid: string) => {
    if (!commandsRoster || commandsRoster.spec.mode !== "list") return;
    const next = commandsRoster.spec.members.filter((m) => m !== fqid);
    await saveCommandsRosterMembers(next);
  };

  const openCommand = (row: DisplayCommand) => {
    openSettingsPanel({
      kind: "custom-command",
      mode: "edit",
      commandId: row.fqid,
      title: `/${row.name}`,
      teamId: teamIdOfFqid(row.fqid),
    });
  };

  const openCreateCommandForTeam = () => {
    openSettingsPanel({
      kind: "custom-command",
      mode: "new",
      targetTeamId: slot.teamId,
    });
  };

  const openSkill = (row: DisplaySkill) => {
    const absPath = row.asset?.dir ? `${row.asset.dir.replace(/[/\\]+$/, "")}/SKILL.md` : undefined;
    const team = useTeamsStore.getState().catalog.find((p) => p.manifest.id === teamIdOfFqid(row.fqid));
    const writable = team?.writable ?? pack?.writable;
    if (!row.owned || !writable) {
      openSettingsPanel({
        kind: "skill-markdown",
        mode: "preview-bundled",
        skillId: row.id,
        title: row.name,
        absPath,
      });
      return;
    }
    openSettingsPanel({
      kind: "skill-markdown",
      mode: "edit",
      skillId: row.id,
      title: row.name,
      teamId: teamIdOfFqid(row.fqid),
      absPath,
    });
  };

  /** Own-team subagent: asset-level enable (everyone loses it when off). */
  const setOwnedSubagentEnabled = async (fqid: string, enabled: boolean | null) => {
    if (!projectRoot) return;
    setBusy(true);
    try {
      await window.electronAPI.teamsSetAssetEnabled(projectRoot, fqid, enabled, "project");
      await load();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setActive = async () => {
    if (!projectRoot) return;
    setBusy(true);
    try {
      await useTeamsStore.getState().setActiveTeam(projectRoot, slot.teamId);
      toast.success(t("settings.teams.toast.activeUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const teamActionError = (err: unknown): string => {
    const msg = String(err instanceof Error ? err.message : err);
    if (/always-on safety-net|always-on project hangar|My Content|Common Team|Common/i.test(msg)) {
      return t("settings.teams.toast.myContentLocked");
    }
    if (/last team with a lead agent/i.test(msg)) {
      return t("settings.teams.toast.lastLead");
    }
    return msg;
  };

  const uninstall = async () => {
    if (!projectRoot || !pack) return;
    deleteConfirm.clearPending();
    setBusy(true);
    try {
      const userOwned = pack.manifest.publisher === "user" && pack.manifest.id !== MY_CONTENT_TEAM_ID;
      if (userOwned) {
        await window.electronAPI.teamsDelete(pack.manifest.id, projectRoot);
      } else {
        await window.electronAPI.teamsUninstall(pack.manifest.id);
      }
      await useTeamsStore.getState().load(projectRoot, { force: true });
      closeSettingsPanel();
    } catch (err) {
      toast.error(teamActionError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleProjectEnabled = async (enabled: boolean) => {
    if (!projectRoot || !pack) return;
    setBusy(true);
    try {
      const result = await useTeamsStore.getState().setEnabled(
        projectRoot,
        pack.manifest.id,
        enabled,
      );
      await load();
      if (!enabled && result?.defaultMovedTo) {
        toast.info(t("settings.teams.toast.defaultMovedToBuiltin"));
      }
    } catch (err) {
      toast.error(teamActionError(err));
      // Reconcile switch after a refused disable (e.g. last lead team).
      await load();
    } finally {
      setBusy(false);
    }
  };

  const teamMcps = useMemo(
    () => mcps.filter((m) => m.teamId === slot.teamId),
    [mcps, slot.teamId],
  );

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.teams.noProject")}
        </p>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("common.loading")}
        </p>
      </div>
    );
  }

  if (!pack.installed) {
    return (
      <div className="flex-1 overflow-auto">
        <div className={SETTINGS_DETAIL_SHELL}>
          <div className="flex items-start gap-3">
            <PackIcon size="lg" />
            <div className="flex-1 min-w-0">
              <h3 className="text-[length:var(--font-size-13)] font-medium">
                {teamDisplayName(pack.manifest.id, pack.manifest.name, t)}
              </h3>
              <p className={cn(SETTINGS_ROW_DESC, "mt-1.5")}>
                {t("settings.teams.notInstalledHint")}
              </p>
            </div>
            <Button
              size="xs"
              className="shadow-none shrink-0"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await window.electronAPI.teamsInstall(pack.manifest.id);
                    await load();
                    toast.success(t("teamsCenter.toast.installed", { name: pack.manifest.name }));
                  } catch (err) {
                    toast.error(String(err instanceof Error ? err.message : err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {t("teamsCenter.card.install")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isMyContent = pack.manifest.id === MY_CONTENT_TEAM_ID;
  // Project hangar (`project.local`) — always-on like Common; not every
  // project-scoped user team (toCardView maps those to kind "local" too).
  const isProjectLocalHangar = pack.manifest.id === PROJECT_DEFAULT_TEAM_ID;
  const isAlwaysOnHangar = isMyContent || isProjectLocalHangar;
  const isUserTeam = pack.manifest.publisher === "user" && !isAlwaysOnHangar;
  const isCore = pack.kind === "core" || pack.source === "core";
  // Built-in / marketplace / Pro: uninstall. User-created: delete.
  // Common + project.local: neither (always-on hangars).
  const removable =
    pack.installed
    && !isAlwaysOnHangar
    && (
      isUserTeam
      || isCore
      || pack.source === "bundled"
      || pack.source === "pro"
      || pack.source === "registry"
    );
  const isActive = activeTeamId === slot.teamId;
  const hasLead = contents.some((c) => c.kind === "orchestrator") || !!leadAsset;

  const renderLeadSection = () => {
    const group = contents.filter((c) => c.kind === "orchestrator");
    if (group.length === 0) return null;
    return (
      <div key="orchestrator">
        <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
          {t(KIND_LABEL_KEYS.orchestrator)}
          <span className="ml-1.5 text-muted-foreground/50 font-normal tabular-nums">
            {group.length}
          </span>
        </p>
        <div className="rounded-lg border border-border divide-y divide-border">
          {group.map((c) => (
            <button
              key={c.id}
              type="button"
              className={CLICK_ROW}
              onClick={() => openLead(c)}
            >
              <div className={CLICK_ROW_TITLE}>{c.name || c.id}</div>
              {c.description && (
                <div className={CLICK_ROW_DESC}>{c.description}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const openCreateSkillForTeam = () => {
    openSettingsPanel({
      kind: "skill-markdown",
      mode: "new",
      targetTeamId: slot.teamId,
    });
  };

  const openInstallSkills = () => {
    openSettingsPanel({ kind: "skill-library" });
  };

  const openMcp = (asset: AssetViewV2) => {
    openSettingsPanel({
      kind: "mcp-server",
      serverName: asset.id || asset.name,
      title: asset.name,
      teamId: asset.teamId,
      readOnly: !asset.editable,
    });
  };

  const openInstallMcp = () => {
    openSettingsPanel({ kind: "mcp-catalog", targetTeamId: slot.teamId });
  };

  const openPasteMcp = () => {
    openSettingsPanel({ kind: "mcp-paste-json", targetTeamId: slot.teamId });
  };

  const renderMcpSection = () => {
    // MCP is team-owned (no cross-team "+"). Writable hangars/custom teams
    // can Install / paste JSON; pack teams are inventory-only.
    const writable = Boolean(pack?.writable);
    if (!(teamMcps.length > 0 || writable || contents.some((c) => c.kind === "mcp"))) {
      return null;
    }
    return (
      <div key="mcp">
        <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
          {t(KIND_LABEL_KEYS.mcp)}
          <span className="ml-1.5 text-muted-foreground/50 font-normal tabular-nums">
            {teamMcps.length}
          </span>
        </p>
        <div className="rounded-lg border border-border divide-y divide-border">
          {teamMcps.length === 0 ? (
            <div className="px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground">
              {t("settings.teams.noMcps")}
            </div>
          ) : (
            teamMcps.map((asset) => (
              <button
                key={asset.fqid}
                type="button"
                className={cn(CLICK_ROW, "w-full")}
                onClick={() => openMcp(asset)}
              >
                <div className={CLICK_ROW_TITLE}>{asset.name}</div>
                {asset.description ? (
                  <div className={CLICK_ROW_DESC}>{asset.description}</div>
                ) : null}
              </button>
            ))
          )}
          {writable && (
            <div className="flex items-stretch divide-x divide-border">
              <button
                type="button"
                disabled={busy}
                aria-label={t("settings.teams.mcpActions.install")}
                title={t("settings.teams.mcpActions.install")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted-foreground/60 transition-colors",
                  "hover:text-foreground disabled:opacity-40",
                )}
                onClick={openInstallMcp}
              >
                <span className="text-[length:var(--font-size-12)]">
                  {t("settings.teams.mcpActions.install")}
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={t("settings.teams.mcpActions.fromJson")}
                title={t("settings.teams.mcpActions.fromJson")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted-foreground/60 transition-colors",
                  "hover:text-foreground disabled:opacity-40",
                )}
                onClick={openPasteMcp}
              >
                <span className="text-[length:var(--font-size-12)]">
                  {t("settings.teams.mcpActions.fromJson")}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSkillsSection = () => {
    // Add / Install / New only on writable teams: Common, Project, user-created.
    // Core / Pro / store teams are pack inventories — browse + remove foreign refs N/A here.
    const writable = Boolean(pack?.writable);
    const canCreate = writable;
    const canInstall = writable;
    const canAddExternal = writable && hasLead;
    if (!(
      displaySkills.length > 0
      || canAddExternal
      || canCreate
      || contents.some((c) => c.kind === "skill")
    )) {
      return null;
    }
    return (
      <div key="skill">
        <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
          {t(KIND_LABEL_KEYS.skill)}
          <span className="ml-1.5 text-muted-foreground/50 font-normal tabular-nums">
            {displaySkills.length}
          </span>
        </p>
        <div className="rounded-lg border border-border divide-y divide-border">
          {displaySkills.length === 0 ? (
            <div className="px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground">
              {t("settings.teams.noSkills")}
            </div>
          ) : (
            displaySkills.map((row) => (
              <div
                key={row.fqid}
                className={cn("flex items-stretch gap-1", row.owned && row.asset && !row.asset.enabled && "opacity-60")}
              >
                <button
                  type="button"
                  className={cn(CLICK_ROW, "min-w-0 flex-1")}
                  onClick={() => openSkill(row)}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={CLICK_ROW_TITLE}>{row.name}</span>
                    {!row.owned && row.asset && (
                      <Badge
                        variant="outline"
                        className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0 max-w-[10rem] truncate"
                        title={row.asset.origin.teamName}
                      >
                        {row.asset.origin.teamName}
                      </Badge>
                    )}
                  </div>
                  {row.description && (
                    <div className={CLICK_ROW_DESC}>{row.description}</div>
                  )}
                </button>
                {row.owned ? null : (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 self-center mr-1 text-muted-foreground hover:text-foreground"
                    disabled={busy}
                    onClick={() => void removeExternalSkill(row.fqid)}
                  >
                    {t("settings.teams.roster.remove")}
                  </Button>
                )}
              </div>
            ))
          )}

          {(canCreate || canAddExternal || canInstall) && (
            <>
              <div className="flex items-stretch divide-x divide-border">
                {canAddExternal && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-expanded={pickingExternalSkill}
                    aria-label={t("settings.teams.skillsRoster.addExternal")}
                    title={t("settings.teams.skillsRoster.addExternal")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted-foreground/60 transition-colors",
                      "hover:text-foreground disabled:opacity-40",
                      pickingExternalSkill && "text-foreground",
                    )}
                    onClick={() => setPickingExternalSkill((v) => !v)}
                  >
                    <PlusIcon className="size-4" />
                    <span className="text-[length:var(--font-size-12)]">
                      {t("settings.teams.skillsRoster.add")}
                    </span>
                  </button>
                )}
                {canInstall && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={t("settings.teams.skillsRoster.install")}
                    title={t("settings.teams.skillsRoster.install")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted-foreground/60 transition-colors",
                      "hover:text-foreground disabled:opacity-40",
                    )}
                    onClick={openInstallSkills}
                  >
                    <span className="text-[length:var(--font-size-12)]">
                      {t("settings.teams.skillsRoster.install")}
                    </span>
                  </button>
                )}
                {canCreate && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={t("settings.teams.skillsRoster.createNew")}
                    title={t("settings.teams.skillsRoster.createNew")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted-foreground/60 transition-colors",
                      "hover:text-foreground disabled:opacity-40",
                    )}
                    onClick={openCreateSkillForTeam}
                  >
                    <span className="text-[length:var(--font-size-12)]">
                      {t("settings.teams.skillsRoster.createNew")}
                    </span>
                  </button>
                )}
              </div>
              {canAddExternal && pickingExternalSkill && (
                <div className="divide-y divide-border">
                  {externalSkillCandidates.length === 0 ? (
                    <p className="px-3 py-2.5 text-center text-[length:var(--font-size-12)] text-muted-foreground">
                      {t("settings.teams.skillsRoster.emptyExternal")}
                    </p>
                  ) : (
                    externalSkillCandidates.map((s) => (
                      <button
                        key={s.fqid}
                        type="button"
                        disabled={busy}
                        className={cn(CLICK_ROW, "flex items-center gap-2")}
                        onClick={() => void addExternalSkill(s.fqid)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={CLICK_ROW_TITLE}>{s.name}</span>
                            <Badge
                              variant="outline"
                              className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0 max-w-[10rem] truncate"
                              title={s.origin.teamName}
                            >
                              {s.origin.teamName}
                            </Badge>
                          </div>
                          {s.description && (
                            <div className={CLICK_ROW_DESC}>{s.description}</div>
                          )}
                        </div>
                        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderCommandsSection = () => {
    const writable = Boolean(pack?.writable);
    const canCreate = writable;
    const canAddExternal = writable && hasLead;
    if (!(
      displayCommands.length > 0
      || canAddExternal
      || canCreate
      || contents.some((c) => c.kind === "command")
    )) {
      return null;
    }
    return (
      <div key="command">
        <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
          {t(KIND_LABEL_KEYS.command)}
          <span className="ml-1.5 text-muted-foreground/50 font-normal tabular-nums">
            {displayCommands.length}
          </span>
        </p>
        <div className="rounded-lg border border-border divide-y divide-border">
          {displayCommands.length === 0 ? (
            <div className="px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground">
              {t("settings.teams.noCommands")}
            </div>
          ) : (
            displayCommands.map((row) => (
              <div
                key={row.fqid}
                className={cn("flex items-stretch gap-1", row.owned && row.asset && !row.asset.enabled && "opacity-60")}
              >
                <button
                  type="button"
                  className={cn(CLICK_ROW, "min-w-0 flex-1")}
                  onClick={() => openCommand(row)}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={CLICK_ROW_TITLE}>/{row.name}</span>
                    {!row.owned && row.asset && (
                      <Badge
                        variant="outline"
                        className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0 max-w-[10rem] truncate"
                        title={row.asset.origin.teamName}
                      >
                        {row.asset.origin.teamName}
                      </Badge>
                    )}
                  </div>
                  {row.description && (
                    <div className={CLICK_ROW_DESC}>{row.description}</div>
                  )}
                </button>
                {row.owned ? null : (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 self-center mr-1 text-muted-foreground hover:text-foreground"
                    disabled={busy}
                    onClick={() => void removeExternalCommand(row.fqid)}
                  >
                    {t("settings.teams.roster.remove")}
                  </Button>
                )}
              </div>
            ))
          )}

          {(canCreate || canAddExternal) && (
            <>
              <div className="flex items-stretch divide-x divide-border">
                {canAddExternal && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-expanded={pickingExternalCommand}
                    aria-label={t("settings.teams.commandsRoster.addExternal")}
                    title={t("settings.teams.commandsRoster.addExternal")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted-foreground/60 transition-colors",
                      "hover:text-foreground disabled:opacity-40",
                      pickingExternalCommand && "text-foreground",
                    )}
                    onClick={() => setPickingExternalCommand((v) => !v)}
                  >
                    <PlusIcon className="size-4" />
                    <span className="text-[length:var(--font-size-12)]">
                      {t("settings.teams.commandsRoster.add")}
                    </span>
                  </button>
                )}
                {canCreate && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={t("settings.teams.commandsRoster.createNew")}
                    title={t("settings.teams.commandsRoster.createNew")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted-foreground/60 transition-colors",
                      "hover:text-foreground disabled:opacity-40",
                    )}
                    onClick={openCreateCommandForTeam}
                  >
                    <span className="text-[length:var(--font-size-12)]">
                      {t("settings.teams.commandsRoster.createNew")}
                    </span>
                  </button>
                )}
              </div>
              {canAddExternal && pickingExternalCommand && (
                <div className="divide-y divide-border">
                  {externalCommandCandidates.length === 0 ? (
                    <p className="px-3 py-2.5 text-center text-[length:var(--font-size-12)] text-muted-foreground">
                      {t("settings.teams.commandsRoster.emptyExternal")}
                    </p>
                  ) : (
                    externalCommandCandidates.map((c) => (
                      <button
                        key={c.fqid}
                        type="button"
                        disabled={busy}
                        className={cn(CLICK_ROW, "flex items-center gap-2")}
                        onClick={() => void addExternalCommand(c.fqid)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={CLICK_ROW_TITLE}>/{c.name}</span>
                            <Badge
                              variant="outline"
                              className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0 max-w-[10rem] truncate"
                              title={c.origin.teamName}
                            >
                              {c.origin.teamName}
                            </Badge>
                          </div>
                          {c.description && (
                            <div className={CLICK_ROW_DESC}>{c.description}</div>
                          )}
                        </div>
                        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderSubagentSection = () => {
    if (!(displaySubagents.length > 0 || hasLead || contents.some((c) => c.kind === "subagent"))) {
      return null;
    }
    return (
      <div key="subagent">
        <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
          {t(KIND_LABEL_KEYS.subagent)}
          <span className="ml-1.5 text-muted-foreground/50 font-normal tabular-nums">
            {displaySubagents.length}
          </span>
        </p>
        <div className="rounded-lg border border-border divide-y divide-border">
          {displaySubagents.length === 0 ? (
            <div className="px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground">
              {t("settings.teams.noSubagents")}
            </div>
          ) : (
            displaySubagents.map((row) => {
              const assetEnabled = row.asset?.enabled ?? true;
              // Project-scoped teams have no app layer; only show when project
              // diverges from the effective app/default enable.
              const overridden =
                !!row.asset
                && row.asset.origin.scope !== "project"
                && isProjectEnableOverridden(row.asset.enabledProject, row.asset.enabledApp);
              const lockSwitch =
                !!row.asset?.blockedBy
                && row.asset.blockedBy !== "asset-disabled-project"
                && row.asset.blockedBy !== "asset-disabled-app";
              return (
                <div
                  key={row.fqid}
                  className={cn("flex items-stretch gap-1", row.owned && !assetEnabled && "opacity-60")}
                >
                  <button
                    type="button"
                    className={cn(CLICK_ROW, "min-w-0 flex-1")}
                    onClick={() => openSubagent(row)}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={CLICK_ROW_TITLE}>{row.name}</span>
                      {!row.owned && row.asset && (
                        <>
                          <Badge
                            variant="outline"
                            className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0 max-w-[10rem] truncate"
                            title={row.asset.origin.teamName}
                          >
                            {row.asset.origin.teamName}
                          </Badge>
                          {row.asset.origin.tier === "pro" && <ProBadge />}
                        </>
                      )}
                    </div>
                    {row.description && (
                      <div className={CLICK_ROW_DESC}>{row.description}</div>
                    )}
                  </button>
                  {row.owned ? (
                    <div className="flex items-center gap-1.5 shrink-0 self-center pr-3">
                      {row.asset && (
                        <OverrideDot
                          overridden={overridden}
                          appValue={row.asset.enabledApp}
                          onReset={() => void setOwnedSubagentEnabled(row.fqid, null)}
                        />
                      )}
                      {lockSwitch ? (
                        <span className="w-9" />
                      ) : (
                        <Switch
                          checked={assetEnabled}
                          disabled={busy || !row.asset}
                          onCheckedChange={(v) => void setOwnedSubagentEnabled(row.fqid, v)}
                          aria-label={row.name}
                        />
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="shrink-0 self-center mr-1 text-muted-foreground hover:text-foreground"
                      disabled={busy}
                      onClick={() => void removeExternalFromRoster(row.fqid)}
                    >
                      {t("settings.teams.roster.remove")}
                    </Button>
                  )}
                </div>
              );
            })
          )}

          {hasLead && (
            <>
              <button
                type="button"
                disabled={busy}
                aria-expanded={pickingExternal}
                aria-label={t("settings.teams.roster.addExternal")}
                title={t("settings.teams.roster.addExternal")}
                className={cn(
                  "flex w-full items-center justify-center px-3 py-2.5 text-muted-foreground/60 transition-colors",
                  "hover:text-foreground disabled:opacity-40",
                  pickingExternal && "text-foreground",
                )}
                onClick={() => setPickingExternal((v) => !v)}
              >
                <PlusIcon className="size-4" />
              </button>
              {pickingExternal && (
                <div className="divide-y divide-border">
                  {externalCandidates.length === 0 ? (
                    <p className="px-3 py-2.5 text-center text-[length:var(--font-size-12)] text-muted-foreground">
                      {t("settings.teams.roster.emptyExternal")}
                    </p>
                  ) : (
                    externalCandidates.map((s) => (
                      <button
                        key={s.fqid}
                        type="button"
                        disabled={busy}
                        className={cn(CLICK_ROW, "flex items-center gap-2")}
                        onClick={() => void addExternalToRoster(s.fqid)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={CLICK_ROW_TITLE}>{s.name}</span>
                            <Badge
                              variant="outline"
                              className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0 max-w-[10rem] truncate"
                              title={s.origin.teamName}
                            >
                              {s.origin.teamName}
                            </Badge>
                            {s.origin.tier === "pro" && <ProBadge />}
                          </div>
                          {s.description && (
                            <div className={CLICK_ROW_DESC}>{s.description}</div>
                          )}
                        </div>
                        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <div className="flex items-start gap-3">
          <PackIcon size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[length:var(--font-size-13)] font-medium">
                {teamDisplayName(pack.manifest.id, pack.manifest.name, t)}
              </h3>
              {pack.manifest.tier === "pro" && <ProBadge />}
              <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                v{pack.manifest.version}
              </Badge>
              {isActive && (
                <Badge variant="secondary" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("settings.teams.card.activated")}
                </Badge>
              )}
              {!pack.compatible && (
                <Badge variant="destructive" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("teamsCenter.card.incompatible")}
                </Badge>
              )}
              {pack.locked && (
                <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("settings.teams.blocked.license")}
                </Badge>
              )}
            </div>
            <p className={cn(SETTINGS_ROW_DESC, "mt-1.5")}>
              {isMyContent
                ? t("settings.teams.myContentDesc")
                : isProjectLocalHangar
                  ? t("settings.teams.projectLocalDesc")
                  : (pack.manifest.longDescription ?? pack.manifest.description)}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                {pack.manifest.publisher}
              </Badge>
              {pack.source !== "pro" && (
                <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {pack.source === "core" || pack.source === "bundled"
                    ? t("settings.teams.origin.official")
                    : pack.source === "registry"
                      ? t("settings.teams.origin.registry")
                      : t("settings.teams.origin.mine")}
                </Badge>
              )}
              {isProjectLocalHangar && (
                <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("settings.teams.localLabel")}
                </Badge>
              )}
              {pack.scope === "project" && (
                <ScopeChip scope={pack.scope} quiet />
              )}
              {(pack.manifest.tags ?? []).map((tag) => (
                <Badge key={tag} variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          {((hasLead && !isActive && !pack.locked) || pack.locked || removable) && (
            <div className={cn(SETTINGS_DETAIL_ACTIONS, "shrink-0 justify-end pt-0.5")}>
              {hasLead && !isActive && !pack.locked && (
                <Button
                  size="xs"
                  variant="default"
                  disabled={busy || !pack.enabled}
                  onClick={() => void setActive()}
                >
                  {t("settings.teams.setActive")}
                </Button>
              )}
              {pack.locked && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    useLayoutStore.getState().setLeftSidebarView("settings");
                    useLayoutStore.getState().setSettingsCategory("about");
                    closeSettingsPanel();
                  }}
                >
                  {t("teamsCenter.card.goActivate")}
                </Button>
              )}
              {removable && (
                <InlineDeleteButton
                  itemId={`pack:${pack.manifest.id}`}
                  pending={deleteConfirm.isPending(`pack:${pack.manifest.id}`)}
                  variant="text"
                  disabled={busy}
                  requestLabel={
                    isUserTeam
                      ? t("settings.teams.deleteTeam")
                      : t("settings.teams.actions.uninstall")
                  }
                  onRequest={() => deleteConfirm.setPendingId(`pack:${pack.manifest.id}`)}
                  onConfirm={() => void uninstall()}
                />
              )}
            </div>
          )}
        </div>

        {!isAlwaysOnHangar && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-[length:var(--font-size-12)] font-medium">
                  {t("settings.teams.enableInProject")}
                </p>
                <OverrideDot
                  overridden={
                    pack.scope !== "project"
                    && isProjectEnableOverridden(pack.enabledProject, pack.enabledApp)
                  }
                  appValue={pack.enabledApp}
                  onReset={() => {
                    if (!projectRoot) return;
                    void window.electronAPI
                      .teamsSetEnabled(projectRoot, pack.manifest.id, null, "project")
                      .then(() => useTeamsStore.getState().load(projectRoot, { force: true }));
                  }}
                />
              </div>
              <p className={cn(SETTINGS_ROW_DESC, "!mt-0.5")}>
                {t("settings.teams.enableInProjectDesc")}
              </p>
            </div>
            <Switch
              checked={pack.enabled}
              disabled={busy || pack.locked}
              onCheckedChange={(enabled) => void toggleProjectEnabled(enabled)}
              aria-label={t("settings.teams.enableInProject")}
            />
          </div>
        )}
        {isAlwaysOnHangar && (
          <div className="rounded-lg border border-border px-3.5 py-2.5">
            <p className="text-[length:var(--font-size-12)] font-medium">
              {t("settings.teams.myContentAlwaysOn")}
            </p>
            <p className={cn(SETTINGS_ROW_DESC, "!mt-0.5")}>
              {isProjectLocalHangar
                ? t("settings.teams.projectLocalAlwaysOnDesc")
                : t("settings.teams.myContentAlwaysOnDesc")}
            </p>
          </div>
        )}

        <div className="space-y-5">
          {renderLeadSection()}
          {renderSubagentSection()}
          {renderSkillsSection()}
          {renderCommandsSection()}
          {renderMcpSection()}

          {contents.length === 0
            && displaySubagents.length === 0
            && displaySkills.length === 0
            && displayCommands.length === 0
            && teamMcps.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border border-border">
              <PackageIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                {t("settings.teams.teamDetailEmpty")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

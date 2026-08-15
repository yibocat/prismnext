import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { UsersIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AppMenu,
  AppMenuContent,
  AppMenuCheckItem,
  AppMenuLabel,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useChatStore } from "@/stores/chat-store";
import { useTeamsStore } from "@/stores/teams-store";
import { teamDisplayName } from "@/lib/teams/team-display-name";
import { normalizeIconSpec } from "@shared/icon-spec";
import { IconRenderer } from "../shared/icon-renderer";
import { useIconImageSrc } from "../shared/use-icon-image-src";
import { COMPOSER_TOOLBAR_TRIGGER } from "./worktree-selector";
import type { TeamCardView } from "@/stores/teams-store";

interface ActiveTeamSelectProps {
  className?: string;
  /** `icon` = always icon-only; `capsule` = AiBar compact row; `default` = panel toolbar. */
  presentation?: "default" | "icon" | "capsule";
  /** Panel toolbar: collapse to icon when the bar is narrow (mirrors Model select). */
  compact?: boolean;
}

function TeamIconView({
  team,
  variant,
}: {
  team: TeamCardView | null;
  variant: "bare" | "badge";
}) {
  const spec = normalizeIconSpec(team?.manifest.icon);
  const imageSrc = useIconImageSrc(spec, team?.dir);
  return (
    <IconRenderer
      spec={spec}
      variant={variant}
      size="sm"
      fallback={variant === "bare" ? "package" : "package"}
      fallbackIcon={variant === "bare" ? UsersIcon : undefined}
      imageSrc={imageSrc}
    />
  );
}

/**
 * Composer active-team picker (design §8.7).
 * Lists enabled teams that have a lead agent; selection updates project default
 * + tab sessionTeamId so chat send and Settings stay aligned.
 */
export function ActiveTeamSelect({
  className,
}: ActiveTeamSelectProps) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const catalog = useTeamsStore((s) => s.catalog);
  const projectActiveId = useTeamsStore((s) => s.activeTeamId);
  const loadTeams = useTeamsStore((s) => s.load);
  const setActiveTeam = useTeamsStore((s) => s.setActiveTeam);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const sessionTeamId = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionTeamId ?? null;
  });
  const setSessionTeamId = useChatStore((s) => s.setSessionTeamId);

  const [activeLeadName, setActiveLeadName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const refreshLeadName = useCallback(async (root: string, teamId: string | null) => {
    if (!teamId) {
      setActiveLeadName(null);
      return null;
    }
    try {
      const team = await window.electronAPI.teamsGetActiveTeam(root, teamId);
      const leadId = team?.orchestratorId;
      if (!team || !leadId) {
        setActiveLeadName(null);
        return { teamId: team?.manifest.id ?? teamId, teamName: team?.manifest.name ?? null, leadName: null };
      }
      const orchs = await window.electronAPI.teamsListAssets(root, "orchestrator");
      const lead = orchs.find(
        (a) => a.teamId === team.manifest.id && (a.id === leadId || a.fqid.endsWith(`:${leadId}`)),
      );
      const name = lead?.name ?? leadId;
      setActiveLeadName(name);
      return { teamId: team.manifest.id, teamName: team.manifest.name, leadName: name };
    } catch {
      setActiveLeadName(null);
      return { teamId, teamName: null, leadName: null };
    }
  }, []);

  // Keep catalog warm; lead label tracks session override → project default.
  useEffect(() => {
    if (!projectRoot) return;
    void loadTeams(projectRoot);
  }, [projectRoot, loadTeams]);

  const candidates = useMemo(
    () => catalog.filter((team) => team.enabled && team.hasOrchestrator && !team.locked),
    [catalog],
  );

  const effectiveId = sessionTeamId ?? projectActiveId ?? candidates[0]?.manifest.id ?? null;

  useEffect(() => {
    if (!projectRoot) {
      setActiveLeadName(null);
      return;
    }
    void refreshLeadName(projectRoot, effectiveId);
  }, [projectRoot, effectiveId, refreshLeadName]);
  const active = candidates.find((team) => team.manifest.id === effectiveId) ?? null;

  const onSelect = useCallback(
    async (teamId: string) => {
      if (!projectRoot || !activeTabId || switching) return;
      if (teamId === effectiveId) {
        setOpen(false);
        return;
      }
      const team = candidates.find((c) => c.manifest.id === teamId);
      setSwitching(true);
      setOpen(false);
      try {
        // Persist project default (Settings + new sessions) and pin this tab.
        // setActiveTeam clears other tab overrides so the picker stays aligned.
        await setActiveTeam(projectRoot, teamId);
        setSessionTeamId(activeTabId, teamId);
        // Lead name for toast/hint: don't block the picker — useEffect refreshes too.
        void refreshLeadName(projectRoot, teamId).then((confirmed) => {
          toast.success(
            t("chat.composer.activeTeamSwitched", {
              team: confirmed?.teamName ?? team?.manifest.name ?? teamId,
              lead: confirmed?.leadName || t("settings.teams.noLead"),
            }),
          );
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("chat.composer.activeTeamSwitchFailed"),
        );
      } finally {
        setSwitching(false);
      }
    },
    [
      projectRoot,
      activeTabId,
      switching,
      effectiveId,
      candidates,
      setActiveTeam,
      setSessionTeamId,
      refreshLeadName,
      t,
    ],
  );

  if (!projectRoot || candidates.length === 0) return null;

  const label = active
    ? teamDisplayName(active.manifest.id, active.manifest.name, t)
    : t("chat.composer.activeTeam");
  const hint = activeLeadName
    ? t("chat.composer.activeTeamHintWithLead", { lead: activeLeadName })
    : t("chat.composer.activeTeamHint");

  // Composer trigger is icon-only — the team name lives in the dropdown panel
  // and the hover tooltip, not on the bar itself.
  return (
    <AppMenu open={open} onOpenChange={setOpen}>
      <Hint label={hint} side="top">
        <AppMenuTrigger asChild>
          <button
            type="button"
            data-active-team={effectiveId ?? undefined}
            data-active-lead={activeLeadName ?? undefined}
            disabled={switching}
            className={cn(
              COMPOSER_TOOLBAR_TRIGGER,
              "size-6 justify-center px-0 max-w-none",
              className,
            )}
            aria-label={label || t("chat.composer.activeTeam")}
            title={label || t("chat.composer.activeTeam")}
          >
            <TeamIconView team={active} variant="bare" />
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" side="top" className="min-w-[14rem] max-w-[18rem]">
        <AppMenuLabel>{t("chat.composer.activeTeam")}</AppMenuLabel>
        {candidates.map((team) => {
          const selected = team.manifest.id === effectiveId;
          return (
            <AppMenuCheckItem
              key={team.manifest.id}
              selected={selected}
              onSelect={() => void onSelect(team.manifest.id)}
              leading={<TeamIconView team={team} variant="badge" />}
              description={team.manifest.description || undefined}
            >
              {teamDisplayName(team.manifest.id, team.manifest.name, t)}
            </AppMenuCheckItem>
          );
        })}
      </AppMenuContent>
    </AppMenu>
  );
}

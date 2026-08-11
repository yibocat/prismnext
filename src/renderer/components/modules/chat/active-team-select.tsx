import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ChevronDownIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useChatStore } from "@/stores/chat-store";
import { useTeamsStore } from "@/stores/teams-store";
import { teamDisplayName } from "@/lib/teams/team-display-name";
import { COMPOSER_TOOLBAR_TRIGGER } from "./worktree-selector";

/**
 * Composer active-team picker (design §8.7).
 * Lists enabled teams that have a lead agent; selection updates project default
 * + tab sessionTeamId so chat send and Settings stay aligned.
 */
export function ActiveTeamSelect({ className }: { className?: string }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const catalog = useTeamsStore((s) => s.catalog);
  const projectActiveId = useTeamsStore((s) => s.activeTeamId);
  const loadTeams = useTeamsStore((s) => s.load);
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
      const team = candidates.find((c) => c.manifest.id === teamId);
      setSwitching(true);
      try {
        // Composer is the tab-level override in the three-layer active-Team
        // chain. Persisted project defaults are changed only from Settings.
        setSessionTeamId(activeTabId, teamId);
        const confirmed = await refreshLeadName(projectRoot, teamId);
        toast.success(
          t("chat.composer.activeTeamSwitched", {
            team: confirmed?.teamName ?? team?.manifest.name ?? teamId,
            lead: confirmed?.leadName || t("settings.teams.noLead"),
          }),
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("chat.composer.activeTeamSwitchFailed"),
        );
      } finally {
        setSwitching(false);
        setOpen(false);
      }
    },
    [
      projectRoot,
      activeTabId,
      switching,
      candidates,
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

  return (
    <AppMenu open={open} onOpenChange={setOpen}>
      <Hint label={hint} side="top">
        <AppMenuTrigger asChild>
          <button
            type="button"
            data-active-team={effectiveId ?? undefined}
            data-active-lead={activeLeadName ?? undefined}
            disabled={switching}
            className={cn(COMPOSER_TOOLBAR_TRIGGER, "max-w-[11rem]", className)}
            aria-label={t("chat.composer.activeTeam")}
          >
            <UsersIcon className="size-3 shrink-0 opacity-80" />
            <span className="min-w-0 truncate">
              <span className="truncate">{label}</span>
              {activeLeadName ? (
                <span className="ml-1 text-muted-foreground/70">· {activeLeadName}</span>
              ) : null}
            </span>
            <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="min-w-[14rem] max-w-[18rem]">
        <AppMenuLabel>{t("chat.composer.activeTeam")}</AppMenuLabel>
        {candidates.map((team) => {
          const selected = team.manifest.id === effectiveId;
          return (
            <AppMenuItem
              key={team.manifest.id}
              onSelect={() => void onSelect(team.manifest.id)}
              leading={
                <CheckIcon
                  className={cn("size-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")}
                />
              }
              description={team.manifest.description || undefined}
            >
              {teamDisplayName(team.manifest.id, team.manifest.name, t)}
            </AppMenuItem>
          );
        })}
      </AppMenuContent>
    </AppMenu>
  );
}

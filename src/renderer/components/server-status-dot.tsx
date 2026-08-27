import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { CircleIcon, DownloadIcon, FileTypeIcon, ServerIcon, SparklesIcon, TerminalIcon } from "lucide-react";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { compileDesktop } from "@/lib/desktop-api/compile";
import { useCompileStore, type CompilerStatus } from "@/stores/compile-store";
import {
  compileEngineIconClass,
  compileEngineTone,
  isCompileEngineAvailable,
  resolveActiveCompileEngineLabel,
} from "@/lib/tex/compile-engine-label";
import { useDocumentStore } from "@/stores/document-store";
import { countActiveTerminalActivity } from "@/lib/terminal/terminal-sidebar-items";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import type {
  AgentLifecyclePhase,
  AgentStatusSnapshot,
} from "../../shared/agent/status";
import { Button } from "@/components/ui/button";
import { useAvailableUpdate } from "@/hooks/use-available-update";
import {
  appStatusDotPhase,
  listRemoteStatusRows,
  remoteConnectionDetailKey,
  remotePhaseToDot,
} from "@/lib/remote/display";
import { useRemoteStore } from "@/stores/remote-store";
import { useWorkbenchStore } from "@/stores/workbench-store";
import { encodeRemoteAbs, parseRemoteAbs } from "@shared/remote";

const AGENT_COLORS: Record<AgentLifecyclePhase, string> = {
  starting: "text-warning",
  ready: "text-success",
  error: "text-destructive",
  stopped: "text-destructive",
};

function StatusRow({
  label,
  detail,
  icon,
  detailClassName,
}: {
  label: string;
  detail: string;
  icon: React.ReactNode;
  detailClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[length:var(--font-hint)] text-muted-foreground flex-1 min-w-0 truncate">
        {label}
      </span>
      <span className={`text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums text-right max-w-[11rem] truncate ${detailClassName ?? ""}`}>
        {detail}
      </span>
    </div>
  );
}

function remoteIconClass(phase: AgentLifecyclePhase): string {
  if (phase === "ready") return "text-success";
  if (phase === "starting") return "text-warning";
  if (phase === "error") return "text-destructive";
  return "text-muted-foreground/50";
}

/**
 * App-level status. Outer dot = local Agent, or the worst remote Host.
 * Git / folder / session facts live on the session hover card.
 */
export function ServerStatusDot({ layer = "hit" }: { layer?: "paint" | "hit" }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isOpeningProject = useDocumentStore((s) => s.isOpeningProject);
  const members = useWorkbenchStore((s) => s.members);
  const remoteHosts = useRemoteStore((s) => s.hosts);
  const remoteByProfileId = useRemoteStore((s) => s.byProfileId);
  const focusedProfileId = parseRemoteAbs(projectRoot ?? "")?.profileId ?? null;
  const remoteRows = useMemo(
    () => listRemoteStatusRows(
      [projectRoot, ...members.map((member) => member.lastPath)],
      remoteHosts,
      remoteByProfileId,
      focusedProfileId,
    ),
    [focusedProfileId, members, projectRoot, remoteByProfileId, remoteHosts],
  );
  const localStatusRoot = useMemo(() => {
    if (projectRoot && !parseRemoteAbs(projectRoot)) return projectRoot;
    return members.find((member) => !parseRemoteAbs(member.lastPath))?.lastPath ?? null;
  }, [members, projectRoot]);
  const [agent, setAgent] = useState<AgentStatusSnapshot>({
    phase: "starting",
    available: false,
    version: "",
    error: null,
    binaryPresent: false,
    projectWarm: null,
    projectWarmPhase: null,
    projectWarmError: null,
  });
  const [retrying, setRetrying] = useState(false);
  const [remoteLatex, setRemoteLatex] = useState<Record<string, CompilerStatus | null>>({});
  const compilerStatus = useCompileStore((s) => s.compilerStatus);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const detectCompilers = useCompileStore((s) => s.detectCompilers);
  const update = useAvailableUpdate();

  useTerminalAiStore((s) => s.sessionStates);
  useRightPanelStore((s) => s.tabs);
  useTerminalStore((s) => s.sessions);
  const activity = countActiveTerminalActivity();

  const refresh = useCallback(async () => {
    try {
      const status = await agentDesktop.agentStatus(
        localStatusRoot ? { projectRoot: localStatusRoot } : undefined,
      );
      setAgent({
        phase: status.ready && status.canEmbed ? "ready" : status.canEmbed ? "starting" : "error",
        available: status.ready && status.canEmbed,
        version: status.sdk,
        error: status.reason ?? null,
        binaryPresent: status.canEmbed,
        projectWarm: null,
        projectWarmPhase: null,
        projectWarmError: null,
      });
    } catch {
      setAgent((prev) => ({
        ...prev,
        phase: "error",
        available: false,
        error: prev.error || "status unavailable",
      }));
    }
  }, [localStatusRoot]);

  useEffect(() => {
    void detectCompilers();
  }, [detectCompilers]);

  const remoteProfileKey = remoteRows.map((row) => `${row.profileId}:${row.phase}`).join("|");
  useEffect(() => {
    let cancelled = false;
    const profiles = remoteRows
      .filter((row) => row.phase === "ready")
      .map((row) => row.profileId);
    if (profiles.length === 0) {
      setRemoteLatex({});
      return;
    }
    void Promise.all(profiles.map(async (profileId) => {
      const projectRoot = encodeRemoteAbs(profileId, "/");
      if (!projectRoot) return [profileId, null] as const;
      try {
        const status = await compileDesktop.compileDetectTexlive({ projectRoot });
        return [profileId, status] as const;
      } catch {
        return [profileId, null] as const;
      }
    })).then((rows) => {
      if (cancelled) return;
      setRemoteLatex(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [remoteProfileKey, remoteRows]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 8000);
    return () => {
      clearInterval(timer);
    };
  }, [projectRoot, refresh]);

  useEffect(() => {
    if (!isOpeningProject) void refresh();
  }, [isOpeningProject, refresh]);

  const onRetry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } catch {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  const latexDetailOf = (status: CompilerStatus | null | undefined) => {
    if (!status) return t("shell.status.checking");
    if (!isCompileEngineAvailable(status)) return t("shell.status.latexMissing");
    const backend = resolveActiveCompileEngineLabel(status);
    return autoCompile
      ? t("shell.status.latexReadyAuto", { backend })
      : t("shell.status.latexReady", { backend });
  };
  const localLatexDetail = latexDetailOf(compilerStatus);
  const showLatexWhere = remoteRows.length > 0;

  const agentDetail =
    agent.phase === "starting"
      ? t("shell.status.connecting")
      : agent.phase === "ready"
        ? t("shell.status.running")
        : agent.phase === "error"
          ? t("shell.status.agentError")
          : t("shell.status.stopped");

  const warmPhase = agent.projectWarmPhase;
  const projectWarmDetail =
    !localStatusRoot || warmPhase == null || warmPhase === "none"
      ? null
      : warmPhase === "ready"
        ? t("shell.status.projectWarmReady")
        : warmPhase === "error"
          ? t("shell.status.projectWarmError")
          : t("shell.status.projectWarmPending");

  const projectWarmColor =
    warmPhase === "ready"
      ? "text-success"
      : warmPhase === "error"
        ? "text-destructive"
        : "text-warning";

  const showAiTerminal = activity.aiRunning > 0 || activity.aiOpen > 0;
  const showUserTerminal = activity.userBusy > 0;
  const terminalAttention = activity.aiRunning > 0 || activity.userBusy > 0;

  const aiTerminalDetail =
    activity.aiRunning > 0
      ? t("shell.status.aiTerminalRunning", {
          running: activity.aiRunning,
          open: activity.aiOpen,
        })
      : t("shell.status.aiTerminalOpen", { open: activity.aiOpen });

  const showRetry =
    agent.phase === "error"
    || agent.phase === "stopped"
    || warmPhase === "error";

  const dotPhase = appStatusDotPhase(remoteRows, agent.phase);

  const glyph = (
    <>
      <CircleIcon
        className={`size-2.5 ${AGENT_COLORS[dotPhase]} fill-current ${
          layer === "paint" ? "" : "hover:scale-125 transition-transform duration-200"
        }`}
        aria-label={t("shell.status.agentAria", {
          status: remoteRows[0]
            ? t(remoteConnectionDetailKey(remoteRows[0].phase))
            : agentDetail,
        })}
      />
      {terminalAttention ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-warning text-[9px] font-medium text-background flex items-center justify-center tabular-nums">
          {activity.aiRunning + activity.userBusy}
        </span>
      ) : null}
    </>
  );

  if (layer === "paint") {
    return (
      <span className="relative flex size-5 shrink-0 items-center justify-center" aria-hidden>
        {glyph}
      </span>
    );
  }

  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="relative flex size-5 shrink-0 items-center justify-center rounded-full"
        >
          {glyph}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-56 p-3">
        <div className="space-y-2">
          {remoteRows.map((row) => {
            const phase = remotePhaseToDot(row.phase);
            return (
              <StatusRow
                key={row.profileId}
                label={row.hostname}
                detail={t(remoteConnectionDetailKey(row.phase))}
                icon={<ServerIcon className={`size-3 shrink-0 ${remoteIconClass(phase)}`} />}
              />
            );
          })}
          <StatusRow
            label={t("shell.status.agent")}
            detail={agentDetail}
            icon={
              <CircleIcon
                className={`size-2.5 shrink-0 fill-current ${AGENT_COLORS[agent.phase]}`}
              />
            }
          />
          {agent.phase === "error" && agent.error ? (
            <p className="text-[length:var(--font-hint)] text-destructive/80 leading-snug pl-4">
              {agent.error}
            </p>
          ) : null}
          {projectWarmDetail ? (
            <StatusRow
              label={t("shell.status.projectWarm")}
              detail={projectWarmDetail}
              icon={
                <CircleIcon
                  className={`size-2.5 shrink-0 fill-current ${projectWarmColor}`}
                />
              }
            />
          ) : null}
          {warmPhase === "error" && agent.projectWarmError ? (
            <p className="text-[length:var(--font-hint)] text-destructive/80 leading-snug pl-4">
              {agent.projectWarmError}
            </p>
          ) : null}
          <StatusRow
            label={t("shell.status.latex")}
            detail={
              showLatexWhere
                ? t("shell.status.latexLocal", { detail: localLatexDetail })
                : localLatexDetail
            }
            icon={
              <FileTypeIcon
                className={`size-3 shrink-0 ${compileEngineIconClass(compileEngineTone(compilerStatus))}`}
              />
            }
          />
          {remoteRows.filter((row) => row.phase === "ready").map((row) => {
            const status = remoteLatex[row.profileId];
            return (
              <StatusRow
                key={`latex-${row.profileId}`}
                label={t("shell.status.latex")}
                detail={t("shell.status.latexRemote", {
                  host: row.hostname,
                  detail: latexDetailOf(status),
                })}
                icon={
                  <FileTypeIcon
                    className={`size-3 shrink-0 ${compileEngineIconClass(compileEngineTone(status))}`}
                  />
                }
              />
            );
          })}
          {update.visible ? (
            <StatusRow
              label={t("shell.status.update")}
              detail={
                update.readyToInstall
                  ? t("shell.status.updateReady")
                  : update.downloading
                    ? t("shell.status.updateDownloading")
                    : t("shell.status.updateAvailable", {
                        version: update.latestVersion ?? "",
                      })
              }
              icon={<DownloadIcon className="size-3 shrink-0 text-primary" />}
            />
          ) : null}
          {showAiTerminal ? (
            <StatusRow
              label={t("shell.status.aiTerminal")}
              detail={aiTerminalDetail}
              icon={
                <SparklesIcon
                  className={`size-3 shrink-0 ${
                    activity.aiRunning > 0
                      ? "text-warning"
                      : "text-muted-foreground/60"
                  }`}
                />
              }
            />
          ) : null}
          {showUserTerminal ? (
            <StatusRow
              label={t("shell.status.terminal")}
              detail={t("shell.status.terminalBusy", { count: activity.userBusy })}
              icon={<TerminalIcon className="size-3 shrink-0 text-warning" />}
            />
          ) : null}
          {showRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-7 mt-1 text-[length:var(--font-hint)]"
              disabled={retrying}
              onClick={() => void onRetry()}
            >
              {retrying ? t("shell.status.retrying") : t("shell.status.retry")}
            </Button>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

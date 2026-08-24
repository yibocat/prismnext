import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { CircleIcon, DownloadIcon, FileTypeIcon, GitBranchIcon, SparklesIcon, TerminalIcon } from "lucide-react";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { useCompileStore } from "@/stores/compile-store";
import {
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
  ProjectWarmPhase,
} from "../../shared/agent/status";
import { isAgentLifecyclePhase, isProjectWarmPhase } from "../../shared/agent/status";
import { Button } from "@/components/ui/button";
import { useGitStore } from "@/stores/git-store";
import { useAvailableUpdate } from "@/hooks/use-available-update";

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
}: {
  label: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[length:var(--font-hint)] text-muted-foreground flex-1">
        {label}
      </span>
      <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums text-right max-w-[9rem] truncate">
        {detail}
      </span>
    </div>
  );
}

function normalizeSnapshot(raw: unknown): AgentStatusSnapshot {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<AgentStatusSnapshot>;
  const phase: AgentLifecyclePhase = isAgentLifecyclePhase(s.phase)
    ? s.phase
    : s.available
      ? "ready"
      : "starting";
  const projectWarmPhase: ProjectWarmPhase | null = isProjectWarmPhase(s.projectWarmPhase)
    ? s.projectWarmPhase
    : typeof s.projectWarm === "boolean"
      ? s.projectWarm
        ? "ready"
        : "warming"
      : null;
  return {
    phase,
    available: Boolean(s.available),
    version: typeof s.version === "string" ? s.version : "",
    error: typeof s.error === "string" ? s.error : null,
    binaryPresent: Boolean(s.binaryPresent),
    projectWarm: projectWarmPhase === "ready" ? true : projectWarmPhase == null ? null : false,
    projectWarmPhase,
    projectWarmError: typeof s.projectWarmError === "string" ? s.projectWarmError : null,
  };
}

/**
 * Compact Agent-first status. Outer dot = OpenCode ACP lifecycle.
 * Project tools warm should already be done by open time; the row reflects that.
 */
export function ServerStatusDot({ layer = "hit" }: { layer?: "paint" | "hit" }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isOpeningProject = useDocumentStore((s) => s.isOpeningProject);
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
  const compilerStatus = useCompileStore((s) => s.compilerStatus);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const detectCompilers = useCompileStore((s) => s.detectCompilers);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const gitBranch = useGitStore((s) => s.branch);
  const gitDirtyCount = useGitStore((s) => s.files.length);
  const update = useAvailableUpdate();

  useTerminalAiStore((s) => s.sessionStates);
  useRightPanelStore((s) => s.tabs);
  useTerminalStore((s) => s.sessions);
  const activity = countActiveTerminalActivity();

  const refresh = useCallback(async () => {
    try {
      const status = await agentDesktop.agentStatus(
        projectRoot ? { projectRoot } : undefined,
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
  }, [projectRoot]);

  useEffect(() => {
    void detectCompilers();
  }, [detectCompilers]);

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

  const latexReady = isCompileEngineAvailable(compilerStatus);
  const latexBackendLabel = resolveActiveCompileEngineLabel(compilerStatus);
  const latexDetail = !compilerStatus
    ? t("shell.status.checking")
    : latexReady
      ? autoCompile
        ? t("shell.status.latexReadyAuto", { backend: latexBackendLabel })
        : t("shell.status.latexReady", { backend: latexBackendLabel })
      : t("shell.status.latexMissing");

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
    projectRoot == null || warmPhase == null || warmPhase === "none"
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

  const glyph = (
    <>
      <CircleIcon
        className={`size-2.5 ${AGENT_COLORS[agent.phase]} fill-current ${
          layer === "paint" ? "" : "hover:scale-125 transition-transform duration-200"
        }`}
        aria-label={t("shell.status.agentAria", { status: agentDetail })}
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
          {isGitRepo ? (
            <StatusRow
              label={t("shell.status.git")}
              detail={
                gitDirtyCount > 0
                  ? t("shell.status.gitDirty", {
                      branch: gitBranch || "…",
                      count: gitDirtyCount,
                    })
                  : t("shell.status.gitClean", { branch: gitBranch || "…" })
              }
              icon={
                <GitBranchIcon
                  className={`size-3 shrink-0 ${
                    gitDirtyCount > 0 ? "text-warning" : "text-success"
                  }`}
                />
              }
            />
          ) : null}
          <StatusRow
            label={t("shell.status.latex")}
            detail={latexDetail}
            icon={
              <FileTypeIcon
                className={`size-3 shrink-0 ${
                  latexReady ? "text-success" : "text-muted-foreground/40"
                }`}
              />
            }
          />
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

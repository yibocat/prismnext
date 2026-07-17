/**
 * experiments-run-panel — Unified command + live output console.
 *
 * One bordered shell: command input on top, streaming output in the middle
 * (while running), action bar at the bottom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HistoryIcon,
  Loader2Icon,
  PlayIcon,
  SquareIcon,
  TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Textarea } from "@/components/ui/textarea";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { cn } from "@/lib/utils";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { shouldShowPermissionGate } from "@/components/modules/chat/permission-gate-panel";
import { resolvePermissionMode } from "@shared/permission-modes";
import {
  EXPERIMENT_RUN_KINDS,
  parseExperimentRunKind,
  type ExperimentRunKind,
} from "../../../shared/experiment-log";
import {
  experimentsCodeClass,
  experimentsCommandInputClass,
  experimentsRunConsoleShellClass,
  experimentsSubsectionLabelClass,
} from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";

import {
  ExperimentsRunConfirmModal,
  type ExperimentsRunConfirmDenyReason,
} from "./experiments-run-confirm-modal";

const KIND_UNTYPED = "__untyped__";

function RunConsoleOutput({ output, running }: { output: string; running: boolean }) {
  const { t } = useTranslation();
  const preRef = useRef<HTMLPreElement>(null);
  const hasOutput = output.trim().length > 0;

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [output]);

  return (
    <pre
      ref={preRef}
      className={cn(
        "max-h-52 min-h-[7rem] overflow-auto px-3 py-2 leading-relaxed",
        experimentsCodeClass,
        hasOutput ? "text-foreground/85" : "text-muted-foreground/45",
        "whitespace-pre-wrap break-words bg-muted/15",
      )}
      aria-live="polite"
      aria-label={t("experiments.output")}
    >
      {hasOutput ? output : running ? t("experiments.runPanel.waitingOutput") : ""}
    </pre>
  );
}

export function ExperimentsRunPanel() {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const selectedId = useExperimentStore((s) => s.selectedId);
  const runs = useExperimentStore((s) => s.detail?.runs);
  const runInFlight = useExperimentStore((s) => s.runInFlight);
  const runCommand = useExperimentStore((s) => s.runCommand);
  const cancelRun = useExperimentStore((s) => s.cancelRun);
  const getPaths = useExperimentStore((s) => s.getPaths);

  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const resolvedMode = resolvePermissionMode(permissionMode);
  const isReadonly = resolvedMode === "readonly";

  const lastCommand = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    return runs[runs.length - 1]?.command ?? null;
  }, [runs]);

  const [command, setCommand] = useState("");
  const [kind, setKind] = useState<ExperimentRunKind | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState("");
  const [pendingKind, setPendingKind] = useState<ExperimentRunKind | "">("");

  const isInFlightForCurrent = Boolean(
    runInFlight && selectedId && runInFlight.id === selectedId,
  );

  // Only block Run when *this* experiment is in flight. Another island's
  // run must not freeze the whole mode (Bug 8.8.1 / Phase 3).
  const canRun =
    Boolean(projectRoot) &&
    Boolean(selectedId) &&
    command.trim().length > 0 &&
    !isInFlightForCurrent &&
    !isReadonly;

  const handleRunClick = useCallback(() => {
    if (!canRun || !projectRoot || !selectedId) return;
    const trimmed = command.trim();
    const runKind = parseExperimentRunKind(kind);
    if (shouldShowPermissionGate(permissionMode, "experiment-run")) {
      setPendingCommand(trimmed);
      setPendingKind(kind);
      setConfirmOpen(true);
      return;
    }
    void runCommand(projectRoot, selectedId, trimmed, undefined, undefined, runKind);
  }, [canRun, command, kind, permissionMode, projectRoot, runCommand, selectedId]);

  const handleAllow = useCallback(() => {
    if (!projectRoot || !selectedId) return;
    setConfirmOpen(false);
    setKind(pendingKind);
    void runCommand(
      projectRoot,
      selectedId,
      pendingCommand,
      undefined,
      undefined,
      parseExperimentRunKind(pendingKind),
    );
  }, [pendingCommand, pendingKind, projectRoot, runCommand, selectedId]);

  const handleDeny = useCallback(
    (reason: ExperimentsRunConfirmDenyReason) => {
      setConfirmOpen(false);
      setPendingCommand("");
      setPendingKind("");
      if (reason === "timeout") {
        toast.info(t("experiments.runPanel.confirmTimeout"));
      }
    },
    [t],
  );

  const handleCancel = useCallback(() => {
    if (!projectRoot || !selectedId || !runInFlight || runInFlight.id !== selectedId) return;
    void cancelRun(projectRoot, selectedId, runInFlight.runId);
  }, [cancelRun, projectRoot, runInFlight, selectedId]);

  const handleReuseLast = useCallback(() => {
    if (lastCommand == null) return;
    setCommand(lastCommand);
  }, [lastCommand]);

  const handleOpenTerminal = useCallback(async () => {
    if (!projectRoot || !selectedId) return;
    const paths = await getPaths(projectRoot, selectedId);
    if (!paths) return;
    const leaf = paths.workspaceRel.split("/").pop() ?? paths.workspaceRel;
    useRightPanelStore
      .getState()
      .openTerminalAtCwd(paths.workspaceAbs, t("experiments.runPanel.labTab", { name: leaf }));
  }, [projectRoot, selectedId, getPaths, t]);

  const cwd = useExperimentStore((s) => s.detail?.meta.workspacePath) ?? "";
  const liveOutput = isInFlightForCurrent ? (runInFlight?.liveOutput ?? "") : "";

  return (
    <div className="space-y-2">
      {isReadonly && !isInFlightForCurrent ? (
        <p className={SETTINGS_ROW_DESC}>{t("experiments.runPanel.readOnly")}</p>
      ) : null}

      <div className={experimentsRunConsoleShellClass}>
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
          <span className={experimentsSubsectionLabelClass}>{t("experiments.command")}</span>
          <span className="font-sans text-[length:var(--font-size-10)] text-muted-foreground/55">
            {t("experiments.runPanel.enterToRun")}
          </span>
        </div>
        <Textarea
          aria-label={t("experiments.command")}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="python train.py --epochs 50"
          spellCheck={false}
          disabled={isInFlightForCurrent}
          rows={isInFlightForCurrent ? 2 : 3}
          className={cn(
            experimentsCommandInputClass,
            experimentsCodeClass,
            isInFlightForCurrent && "cursor-not-allowed text-muted-foreground/70",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canRun) handleRunClick();
            }
          }}
        />

        {isInFlightForCurrent ? (
          <>
            <div className="border-t border-border/60" aria-hidden />
            <RunConsoleOutput output={liveOutput} running />
          </>
        ) : null}

        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 border-t border-border/60 px-2 py-1.5",
            "bg-muted/25",
          )}
        >
          <AppSelect
            value={kind || KIND_UNTYPED}
            disabled={isInFlightForCurrent}
            onValueChange={(v) =>
              setKind(v === KIND_UNTYPED ? "" : (v as ExperimentRunKind))
            }
          >
            <AppSelectTrigger
              variant="wide"
              aria-label={t("experiments.type")}
              title={t("experiments.runPanel.typeTitle")}
              className="min-w-[7.5rem]"
            >
              <AppSelectValue placeholder={t("experiments.type")} />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value={KIND_UNTYPED}>{t("experiments.type")}</AppSelectItem>
              {EXPERIMENT_RUN_KINDS.map((k) => (
                <AppSelectItem key={k} value={k}>
                  {k}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
          <Hint
            label={
              isReadonly
                ? t("experiments.runPanel.permissionReadonly")
                : !projectRoot || !selectedId
                  ? t("experiments.runPanel.selectExperiment")
                  : isInFlightForCurrent
                    ? t("experiments.runPanel.runInProgress")
                    : command.trim().length === 0
                      ? t("experiments.runPanel.enterCommand")
                      : t("experiments.runPanel.runInLab")
            }
          >
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleRunClick}
              disabled={!canRun}
              className="h-7 gap-1 px-2.5"
            >
              <PlayIcon className="size-3" aria-hidden />
              {t("experiments.run")}
            </Button>
          </Hint>
          {isInFlightForCurrent ? (
            <Hint label={t("experiments.runPanel.cancelRun")}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCancel}
                className="h-7 gap-1 px-2.5"
              >
                <SquareIcon className="size-3" aria-hidden />
                {t("experiments.cancel")}
              </Button>
            </Hint>
          ) : null}
          <Hint
            label={
              lastCommand == null
                ? t("experiments.runPanel.noPrior")
                : t("experiments.runPanel.populateLast")
            }
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleReuseLast}
              disabled={lastCommand == null || isInFlightForCurrent}
              className="h-7 gap-1 px-2"
            >
              <HistoryIcon className="size-3" aria-hidden />
              {t("experiments.reuseLast")}
            </Button>
          </Hint>
          <Hint label={t("experiments.runPanel.openTerminal")}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleOpenTerminal()}
              disabled={!projectRoot || !selectedId}
              className="h-7 gap-1 px-2"
            >
              <TerminalIcon className="size-3" aria-hidden />
              {t("experiments.terminal")}
            </Button>
          </Hint>

          {isInFlightForCurrent ? (
            <span
              className="ml-auto flex min-w-0 items-center gap-1.5 text-[length:var(--font-size-11)] text-info"
              aria-live="polite"
            >
              <Loader2Icon className="size-3 shrink-0 animate-spin" aria-hidden />
              <span className="shrink-0 font-medium">{t("experiments.running")}</span>
            </span>
          ) : null}
        </div>
      </div>

      <ExperimentsRunConfirmModal
        open={confirmOpen}
        command={pendingCommand}
        cwd={cwd}
        kind={pendingKind}
        onKindChange={setPendingKind}
        onAllow={handleAllow}
        onDeny={handleDeny}
      />
    </div>
  );
}

/**
 * experiments-run-panel — Lightweight Run dialog for the Execution pane.
 * Opened from the mode toolbar; history stays full-bleed underneath.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { buildPermissionRulesFromSettings, resolvePermissionMode } from "@shared/permissions/modes";
import {
  buildPermissionAskView,
  shouldShowPermissionGate,
} from "@/components/modules/chat/permission-gate-panel";
import { PermissionAskSurface } from "@/components/modules/chat/permission-ask-surface";
import {
  EXPERIMENT_RUN_KINDS,
  parseExperimentRunKind,
  type ExperimentRunKind,
} from "../../../shared/experiments/log";
import { EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS } from "../../../shared/permissions/timeouts";
import { experimentsCodeClass } from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";
import type { PendingPermission } from "@/stores/permission-store";

let experimentRunAskNonce = 0;

export function nextExperimentRunHostKey(experimentId: string): string {
  return `experiment-run:${experimentId}:${++experimentRunAskNonce}`;
}

const KIND_UNTYPED = "__untyped__";

export function ExperimentsRunDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const selectedId = useExperimentStore((s) => s.selectedId);
  const runs = useExperimentStore((s) => s.detail?.runs);
  const runInFlight = useExperimentStore((s) => s.runInFlight);
  const runCommand = useExperimentStore((s) => s.runCommand);
  const cancelRun = useExperimentStore((s) => s.cancelRun);
  const getPaths = useExperimentStore((s) => s.getPaths);

  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const settings = useSettingsStore((s) => s.settings);
  const permRules = useMemo(
    () => buildPermissionRulesFromSettings(settings),
    [settings],
  );
  const resolvedMode = resolvePermissionMode(permissionMode);
  const isReadonly = resolvedMode === "readonly";

  const lastCommand = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    return runs[runs.length - 1]?.command ?? null;
  }, [runs]);

  const [command, setCommand] = useState("");
  const [kind, setKind] = useState<ExperimentRunKind | "">("");
  const [ask, setAsk] = useState<{
    hostKey: string;
    command: string;
    kind: ExperimentRunKind | "";
    cwd: string;
  } | null>(null);
  const [starting, setStarting] = useState(false);

  const isInFlightForCurrent = Boolean(
    runInFlight && selectedId && runInFlight.id === selectedId,
  );

  useEffect(() => {
    if (!open) {
      setAsk(null);
      setStarting(false);
    }
  }, [open]);

  const canRun =
    Boolean(projectRoot) &&
    Boolean(selectedId) &&
    command.trim().length > 0 &&
    !isInFlightForCurrent &&
    !isReadonly &&
    !starting &&
    !ask;

  const startRun = useCallback(
    async (cmd: string, runKind: ExperimentRunKind | undefined) => {
      if (!projectRoot || !selectedId) return;
      setStarting(true);
      try {
        const runId = await runCommand(
          projectRoot,
          selectedId,
          cmd,
          undefined,
          undefined,
          runKind,
        );
        if (runId) {
          onOpenChange(false);
        } else {
          toast.error(t("experiments.runPanel.startFailed"));
        }
      } finally {
        setStarting(false);
      }
    },
    [onOpenChange, projectRoot, runCommand, selectedId, t],
  );

  const handleRunClick = useCallback(() => {
    if (!canRun || !projectRoot || !selectedId) return;
    const trimmed = command.trim();
    const runKind = parseExperimentRunKind(kind);
    const cwd = useExperimentStore.getState().detail?.meta.workspacePath ?? projectRoot;
    if (shouldShowPermissionGate(permissionMode, "experiment-run", {
      projectRoot,
      bashCommand: trimmed,
      bashCwd: cwd,
    }, permRules)) {
      setAsk({
        hostKey: nextExperimentRunHostKey(selectedId),
        command: trimmed,
        kind,
        cwd,
      });
      return;
    }
    void startRun(trimmed, runKind);
  }, [
    canRun,
    command,
    kind,
    permissionMode,
    permRules,
    projectRoot,
    selectedId,
    startRun,
  ]);

  const handleAllow = useCallback(() => {
    if (!projectRoot || !selectedId || !ask) return;
    setKind(ask.kind);
    const pending = ask;
    setAsk(null);
    void startRun(pending.command, parseExperimentRunKind(pending.kind));
  }, [ask, projectRoot, selectedId, startRun]);

  const handleDeny = useCallback(
    (reason: "timeout" | "user") => {
      setAsk(null);
      if (reason === "timeout") {
        toast.info(t("experiments.runPanel.confirmTimeout"));
      }
    },
    [t],
  );

  const handleAskTimeout = useCallback(() => handleDeny("timeout"), [handleDeny]);
  const handleAskUserDeny = useCallback(() => handleDeny("user"), [handleDeny]);

  const askView = useMemo(() => {
    if (!ask) return null;
    const permission: PendingPermission = {
      id: ask.hostKey,
      tabId: ask.hostKey,
      toolName: "experiment-run",
      message: ask.command,
      args: { command: ask.command, cwd: ask.cwd },
      options: [],
    };
    return buildPermissionAskView(permission, "experiment-run");
  }, [ask]);

  const handleCancel = useCallback(() => {
    if (!projectRoot || !selectedId || !runInFlight || runInFlight.id !== selectedId) {
      return;
    }
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

  const liveCommand = isInFlightForCurrent ? (runInFlight?.command ?? command) : command;

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("experiments.runPanel.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("experiments.runPanel.dialogDesc")}
            </DialogDescription>
          </DialogHeader>

          {isReadonly && !isInFlightForCurrent ? (
            <p className={SETTINGS_ROW_DESC}>{t("experiments.runPanel.readOnly")}</p>
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <AppSelect
                value={kind || KIND_UNTYPED}
                disabled={isInFlightForCurrent || starting || Boolean(ask)}
                onValueChange={(v) =>
                  setKind(v === KIND_UNTYPED ? "" : (v as ExperimentRunKind))
                }
              >
                <AppSelectTrigger
                  variant="wide"
                  aria-label={t("experiments.type")}
                  title={t("experiments.runPanel.typeTitle")}
                  className="h-7 min-w-[6.5rem]"
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
                  lastCommand == null
                    ? t("experiments.runPanel.noPrior")
                    : t("experiments.runPanel.populateLast")
                }
              >
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={handleReuseLast}
                  disabled={lastCommand == null || isInFlightForCurrent || starting || Boolean(ask)}
                  className="h-7 gap-1 px-1.5"
                >
                  <HistoryIcon className="size-3" aria-hidden />
                  <span>{t("experiments.reuseLast")}</span>
                </Button>
              </Hint>

              <Hint label={t("experiments.runPanel.openTerminal")}>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => void handleOpenTerminal()}
                  disabled={!projectRoot || !selectedId}
                  className="h-7 gap-1 px-1.5"
                >
                  <TerminalIcon className="size-3" aria-hidden />
                  <span>{t("experiments.terminal")}</span>
                </Button>
              </Hint>
            </div>

            <Textarea
              aria-label={t("experiments.command")}
              value={liveCommand}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="python train.py --epochs 50"
              spellCheck={false}
              disabled={isInFlightForCurrent || starting || Boolean(ask)}
              rows={4}
              className={cn(
                "min-h-[5.5rem] w-full resize-y",
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
            <p className={SETTINGS_ROW_DESC}>{t("experiments.runPanel.enterToRun")}</p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {isInFlightForCurrent ? (
              <div className="flex w-full items-center justify-between gap-2">
                <span
                  className="flex items-center gap-1.5 text-[length:var(--font-size-11)] text-info"
                  aria-live="polite"
                >
                  <Loader2Icon className="size-3 shrink-0 animate-spin" aria-hidden />
                  <span className="font-medium">
                    {t(runInFlight?.cancelRequested ? "experiments.cancelling" : "experiments.running")}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  className="gap-1"
                >
                  <SquareIcon className="size-3" aria-hidden />
                  {t("experiments.cancel")}
                </Button>
              </div>
            ) : ask && askView ? (
              <div className="w-full">
                <PermissionAskSurface
                  key={ask.hostKey}
                  toolName="experiment-run"
                  summary={askView.summary}
                  peek={askView.peek}
                  resolving={starting}
                  onAllow={() => handleAllow()}
                  onDeny={handleAskUserDeny}
                  timeoutMs={EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS}
                  onTimeout={handleAskTimeout}
                />
              </div>
            ) : (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                  {t("experiments.close")}
                </Button>
                <Hint
                  label={
                    isReadonly
                      ? t("experiments.runPanel.permissionReadonly")
                      : !projectRoot || !selectedId
                        ? t("experiments.runPanel.selectExperiment")
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
                    className="gap-1"
                  >
                    {starting ? (
                      <Loader2Icon className="size-3 animate-spin" aria-hidden />
                    ) : (
                      <PlayIcon className="size-3" aria-hidden />
                    )}
                    {t("experiments.run")}
                  </Button>
                </Hint>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

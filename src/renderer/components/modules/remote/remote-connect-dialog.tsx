import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { REMOTE_CONNECT_GATES } from "@shared/remote";
import { useRemoteStore } from "@/stores/remote-store";
import {
  connectProgress,
  latestGateDetail,
  logsForProfile,
  resolveConnectGateStatus,
} from "@/lib/remote/display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function RemoteConnectDialog({
  alias,
  open,
  onOpenChange,
  onReady,
  autoCloseOnReady = false,
  blocking = false,
  onContinue,
}: {
  alias: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReady?: () => void;
  autoCloseOnReady?: boolean;
  blocking?: boolean;
  onContinue?: () => void;
}) {
  const { t } = useTranslation();
  const state = useRemoteStore((s) => (alias ? s.byProfileId[alias] : undefined));
  const logs = useRemoteStore((s) => s.logs);
  const connect = useRemoteStore((s) => s.connect);
  const trustHostAndConnect = useRemoteStore((s) => s.trustHostAndConnect);
  const notified = useRef(false);
  const logPaneRef = useRef<HTMLDivElement>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      notified.current = false;
      setLogsOpen(false);
      return;
    }
    if (!alias) return;
    const phase = useRemoteStore.getState().byProfileId[alias]?.phase;
    if (!phase || phase === "idle" || phase === "disconnected" || phase === "error") {
      void connect(alias);
    }
  }, [alias, connect, open]);

  useEffect(() => {
    if (!open || state?.phase !== "ready" || notified.current) return;
    notified.current = true;
    if (autoCloseOnReady) {
      onReady?.();
      onOpenChange(false);
    }
  }, [autoCloseOnReady, onOpenChange, onReady, open, state?.phase]);

  useEffect(() => {
    if (state?.phase === "error") setLogsOpen(true);
  }, [state?.phase]);

  const constitution = state && (
    state.phase === "ready"
    || state.phase === "error"
    || state.phase === "reconnecting"
  )
    ? state.constitution
    : undefined;
  const profileLogs = useMemo(
    () => (alias ? logsForProfile(logs, alias, 400) : []),
    [alias, logs],
  );
  const progress = useMemo(
    () => connectProgress({
      constitution,
      phase: state?.phase ?? "connecting",
      logs: profileLogs,
    }),
    [constitution, profileLogs, state?.phase],
  );

  useEffect(() => {
    const pane = logPaneRef.current;
    if (!pane || !logsOpen) return;
    pane.scrollTop = pane.scrollHeight;
  }, [logsOpen, profileLogs]);

  const phase = state?.phase ?? "connecting";
  const awaiting = state?.phase === "awaiting_host_key" ? state : null;
  const errorMessage = state?.phase === "error"
    ? (state.code && t(`remote.error.${state.code}`, { defaultValue: state.message }))
      || state.message
    : null;
  const ready = phase === "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,56rem)] overflow-y-auto sm:max-w-3xl"
        onPointerDownOutside={blocking ? (event) => event.preventDefault() : undefined}
        onInteractOutside={blocking ? (event) => event.preventDefault() : undefined}
        onEscapeKeyDown={blocking ? (event) => event.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {ready
              ? t("remote.connectSuccess", { host: alias ?? "" })
              : t("remote.connectTitle", { host: alias ?? "" })}
          </DialogTitle>
          <DialogDescription className="break-words whitespace-pre-wrap">
            {ready ? t("remote.phase.ready") : t(`remote.phase.${phase}`)}
            {awaiting
              ? ` — ${t("remote.hostKeyPrompt", { fingerprint: awaiting.hostKey.fingerprint })}`
              : null}
          </DialogDescription>
        </DialogHeader>
        {errorMessage ? (
          <p className="max-h-24 overflow-y-auto break-words whitespace-pre-wrap font-mono text-[length:var(--font-size-12)] text-destructive">
            {errorMessage}
          </p>
        ) : (
          <p className="text-muted-foreground text-[length:var(--font-size-12)]">{t("remote.modelKeysNote")}</p>
        )}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[length:var(--font-size-12)] text-muted-foreground">
            <span>{t("remote.connectSteps")}</span>
            <span className="tabular-nums">
              {t("remote.connectProgress", {
                completed: progress.completed,
                total: progress.total,
              })}
            </span>
          </div>
          <Progress value={progress.percent} className="bg-muted" />
        </div>
        <div className="min-h-0 space-y-2">
          <ol className="max-h-48 space-y-1.5 overflow-y-auto text-[length:var(--font-size-12)]">
            {REMOTE_CONNECT_GATES.map((gate) => {
              const status = resolveConnectGateStatus(gate, constitution, profileLogs);
              const detail = latestGateDetail(gate, constitution, profileLogs);
              const current = progress.currentGate === gate;
              return (
                <li
                  key={gate}
                  className={cn(
                    "flex gap-2",
                    status === "fail" ? "text-destructive" : "text-foreground",
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                    {status === "ok" ? (
                      <Check className="size-3.5" />
                    ) : status === "fail" ? (
                      <X className="size-3.5 text-destructive" />
                    ) : current && !ready ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      t("remote.gatePending")
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div>{t(`remote.gate.${gate}`)}</div>
                    {detail ? (
                      <p className="break-words whitespace-pre-wrap text-muted-foreground">
                        {detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        {profileLogs.length > 0 ? (
          <div className="space-y-1">
            <button
              type="button"
              className="flex items-center gap-1 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground"
              aria-expanded={logsOpen}
              onClick={() => setLogsOpen((current) => !current)}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", logsOpen && "rotate-90")} />
              {t("remote.connectLogs")}
            </button>
            {logsOpen ? (
              <div
                ref={logPaneRef}
                className="max-h-[min(40vh,24rem)] overflow-auto rounded-md border bg-muted p-3 font-mono text-[length:var(--font-size-12)] text-foreground"
              >
                {profileLogs.map((line, index) => (
                  <p
                    key={`${line.ts}-${index}`}
                    className={cn(
                      "break-words whitespace-pre-wrap select-text",
                      line.level === "error" ? "text-destructive" : null,
                    )}
                  >
                    {line.level === "ok" || line.level === "error" || line.level === "warn"
                      ? `[${line.level}] ${line.message}`
                      : line.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          {awaiting ? (
            <Button
              type="button"
              onClick={() => {
                if (!alias) return;
                void trustHostAndConnect(alias, awaiting.hostKey);
              }}
            >
              {t("remote.trustHost")}
            </Button>
          ) : null}
          {phase === "error" ? (
            <Button
              type="button"
              onClick={() => {
                if (!alias) return;
                void connect(alias);
              }}
            >
              {t("remote.retry")}
            </Button>
          ) : null}
          {ready ? (
            <Button
              type="button"
              onClick={() => {
                if (onContinue) onContinue();
                else onOpenChange(false);
              }}
            >
              {t("remote.connectContinue")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={ready ? "ghost" : "outline"}
            onClick={() => onOpenChange(false)}
          >
            {t("remote.connectDismiss")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shown when a remembered remote project needs a host key or hit an error. */
export function RemoteConnectHost() {
  const alias = useRemoteStore((s) => s.connectDialogAlias);
  const dialog = useRemoteStore((s) => s.connectDialog);
  const closeConnectDialog = useRemoteStore((s) => s.closeConnectDialog);
  const pendingSession = dialog?.pendingAction === "session-load" ? dialog.pendingSession : undefined;
  const autoCloseOnReady = dialog?.autoCloseOnReady === true;

  return (
    <RemoteConnectDialog
      alias={alias}
      open={Boolean(alias)}
      blocking={dialog?.blocking === true}
      autoCloseOnReady={autoCloseOnReady}
      onOpenChange={(next) => {
        if (!next) closeConnectDialog();
      }}
      onContinue={() => {
        void (async () => {
          if (pendingSession) {
            const { applySessionActivate } = await import("@/lib/workspace/project-context");
            await applySessionActivate({
              conversationId: pendingSession.conversationId,
              projectId: pendingSession.projectId,
              lastPath: pendingSession.lastPath,
              connectRemote: true,
            });
          }
          closeConnectDialog();
        })();
      }}
    />
  );
}

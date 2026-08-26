import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { REMOTE_CONNECT_GATES } from "@shared/remote";
import { useRemoteStore } from "@/stores/remote-store";
import { logsForProfile, resolveConnectGateStatus } from "@/lib/remote/display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function RemoteConnectDialog({
  alias,
  open,
  onOpenChange,
  onReady,
}: {
  alias: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReady: () => void;
}) {
  const { t } = useTranslation();
  const state = useRemoteStore((s) => (alias ? s.byProfileId[alias] : undefined));
  const logs = useRemoteStore((s) => s.logs);
  const connect = useRemoteStore((s) => s.connect);
  const trustHostAndConnect = useRemoteStore((s) => s.trustHostAndConnect);
  const notified = useRef(false);

  useEffect(() => {
    if (!open) {
      notified.current = false;
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
    onReady();
  }, [onReady, open, state?.phase]);

  const constitution = state && (state.phase === "ready" || state.phase === "error")
    ? state.constitution
    : undefined;
  const profileLogs = useMemo(
    () => (alias ? logs.filter((line) => line.profileId === alias) : []),
    [alias, logs],
  );
  const recentLogs = alias ? logsForProfile(logs, alias, 8) : [];
  const phase = state?.phase ?? "connecting";
  const awaiting = state?.phase === "awaiting_host_key" ? state : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {t("remote.connectTitle", { host: alias ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {t(`remote.phase.${phase}`)}
            {state?.phase === "error" && state.message ? ` — ${state.message}` : null}
            {awaiting
              ? ` — ${t("remote.hostKeyPrompt", { fingerprint: awaiting.hostKey.fingerprint })}`
              : null}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-[length:var(--font-size-12)]">{t("remote.modelKeysNote")}</p>
        <ol className="max-h-56 space-y-1 overflow-y-auto text-[length:var(--font-size-12)]">
          {REMOTE_CONNECT_GATES.map((gate) => {
            const status = resolveConnectGateStatus(gate, constitution, profileLogs);
            const detail = constitution?.gates.find((item) => item.gate === gate)?.detail;
            return (
              <li
                key={gate}
                className={cn(
                  "flex gap-2",
                  status === "fail" ? "text-destructive" : "text-muted-foreground",
                )}
                title={detail}
              >
                <span className="w-8 shrink-0">
                  {status === "ok"
                    ? t("remote.gateOk")
                    : status === "fail"
                      ? t("remote.gateFail")
                      : t("remote.gatePending")}
                </span>
                <span className="min-w-0 truncate">{t(`remote.gate.${gate}`)}</span>
              </li>
            );
          })}
        </ol>
        {recentLogs.length > 0 ? (
          <div className="max-h-24 space-y-0.5 overflow-y-auto text-[length:var(--font-size-12)] text-muted-foreground">
            {recentLogs.map((line) => (
              <p key={`${line.ts}-${line.message}`} className="truncate" title={line.message}>
                {line.message}
              </p>
            ))}
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
          {state?.phase === "error" ? (
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("remote.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

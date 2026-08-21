/**
 * experiments-run-confirm-modal — Mode-internal confirmation modal for
 * the Experiments mode run panel (Sprint 0.7, Task 6).
 *
 * Why a mode-internal modal (D3):
 *
 *   The existing shell-confirm UI is structurally coupled to the ACP
 *   tool-call lifecycle (triggered only from `requestPermission`, keyed
 *   by `{tabId, toolCallId, permissionId}`, executed via
 *   `answerPermission`). It is NOT reusable from a pure UI path —
 *   `registerBashJobIntent` is a leftover IPC hook, not a UX entry.
 *
 *   So we build our own modal. The same permission rules are consulted
 *   via the renderer-side `shouldShowPermissionGate` helper (the
 *   renderer-side decision was already made before the modal opens; the
 *   modal is the UX, and the main `experiment:run` handler is the
 *   backstop that re-validates with `resolvePermissionAction`).
 *
 * Behaviour:
 *   - Allow  -> call `onAllow` (run panel will call `runCommand`).
 *   - Deny   -> close without invoking onAllow.
 *   - Timeout (EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS, 60s) -> auto-deny with reason.
 *   - Dialog unmounts / backdrop click / Esc all behave like user Deny.
 */

export type ExperimentsRunConfirmDenyReason = "timeout" | "user";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, TerminalIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  EXPERIMENT_RUN_KINDS,
  type ExperimentRunKind,
} from "../../../shared/experiment-log";
import { EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS } from "../../../shared/permission-timeouts";
import { experimentsCodeClass, experimentsUiValueClass } from "./experiments-detail-chrome";

const KIND_UNTYPED = "__untyped__";

export interface ExperimentsRunConfirmModalProps {
  open: boolean;
  /** Command being approved — read-only display. */
  command: string;
  /** Project-relative working directory (e.g. `experiment/exp-xxx`). */
  cwd: string;
  /** Optional run classification (empty string = untyped). */
  kind?: ExperimentRunKind | "";
  onKindChange?: (kind: ExperimentRunKind | "") => void;
  /** Invoked when the user clicks Allow. The modal closes itself. */
  onAllow: () => void;
  /** Invoked when the user clicks Deny, the timeout fires, or the dialog
   *  is dismissed (backdrop / Esc / close button). */
  onDeny: (reason: ExperimentsRunConfirmDenyReason) => void;
}

export function ExperimentsRunConfirmModal({
  open,
  command,
  cwd,
  kind = "",
  onKindChange,
  onAllow,
  onDeny,
}: ExperimentsRunConfirmModalProps) {
  const { t } = useTranslation();
  const [resolving, setResolving] = useState(false);
  // Track whether a final decision has been made so timeout + manual
  // button press can't race the same callback twice.
  const settledRef = useRef(false);

  // Reset the settled flag whenever the modal re-opens, and reset the
  // resolving flag too so a previous resolution doesn't carry over.
  useEffect(() => {
    if (open) {
      settledRef.current = false;
      setResolving(false);
    }
  }, [open]);

  // Auto-deny — longer than the old 15s window so multi-line commands are
  // readable, still shorter than chat ACP `PERMISSION_UI_TIMEOUT_MS` (120s).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!settledRef.current) {
        settledRef.current = true;
        onDeny("timeout");
      }
    }, EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [open, onDeny]);

  const handleAllow = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setResolving(true);
    onAllow();
  };

  const handleDeny = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setResolving(true);
    onDeny("user");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Backdrop / Esc / close button — all count as deny. The button
        // handlers also call onDeny but guard against double-fire via
        // `settledRef`, so calling onDeny from `onOpenChange` first is
        // safe: subsequent onDeny() calls are no-ops.
        if (!next && !settledRef.current) {
          settledRef.current = true;
          onDeny("user");
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(e) => {
          // Treat Esc as a deny — matches the agent UX.
          if (!settledRef.current) {
            settledRef.current = true;
            onDeny("user");
          }
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-warning" aria-hidden />
            {t("experiments.runConfirm.title")}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p className="text-[length:var(--font-size-13)] text-foreground/85">
                {t("experiments.runConfirm.body")}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-[length:var(--font-size-12)]">
          <div className="space-y-1">
            <div className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/70">
              {t("experiments.command")}
            </div>
            <pre
              className={cn(
                "max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40",
                "px-2 py-1.5 whitespace-pre-wrap break-words",
                experimentsCodeClass,
              )}
            >
              {command || t("experiments.runConfirm.empty")}
            </pre>
          </div>
          <div className="space-y-1">
            <div className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/70">
              {t("experiments.runConfirm.workingDir")}
            </div>
            <div
              className={cn(
                "truncate rounded-md border border-border/60 bg-muted/30 px-2 py-1",
                experimentsUiValueClass,
              )}
              title={cwd}
            >
              {cwd || "—"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/70">
              {t("experiments.type")}
            </div>
            <AppSelect
              value={kind || KIND_UNTYPED}
              disabled={!onKindChange}
              onValueChange={(v) =>
                onKindChange?.(v === KIND_UNTYPED ? "" : (v as ExperimentRunKind))
              }
            >
              <AppSelectTrigger
                variant="dialog"
                className="w-full"
                aria-label={t("experiments.type")}
              >
                <AppSelectValue placeholder={t("experiments.untyped")} />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value={KIND_UNTYPED}>{t("experiments.untyped")}</AppSelectItem>
                {EXPERIMENT_RUN_KINDS.map((k) => (
                  <AppSelectItem key={k} value={k}>
                    {k}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>

        <CountdownProgress active={open && !settledRef.current} />

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleDeny}
            disabled={resolving}
          >
            <XIcon className="size-3.5" aria-hidden />
            {t("experiments.runConfirm.deny")}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleAllow}
            disabled={resolving}
            autoFocus
          >
            {resolving ? (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {t("experiments.runConfirm.allow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CountdownProgress — linear progress bar over
 * `EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS` that auto-resets when `active`
 * toggles. Driven by setInterval for a simple determinate bar.
 */
function CountdownProgress({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const startRef = useRef<number | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setValue(0);
      return;
    }
    startRef.current = Date.now();
    setValue(0);
    const tick = () => {
      const start = startRef.current;
      if (start == null) return;
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS) * 100);
      setValue(pct);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  const remaining = Math.max(
    0,
    Math.ceil((EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS - (value / 100) * EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS) / 1000),
  );

  return (
    <div className="space-y-1">
      <Progress
        value={value}
        aria-label={t("experiments.runConfirm.autoDeny", { seconds: remaining })}
        className="h-1"
      />
      <p className="text-[length:var(--font-size-11)] text-muted-foreground/60">
        {t("experiments.runConfirm.autoDeny", { seconds: remaining })}
      </p>
    </div>
  );
}

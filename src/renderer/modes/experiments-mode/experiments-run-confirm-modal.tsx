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
 *   `registerBashJobIntent` is a file-bridge marker, not a UX entry.
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
 *   - 120s timeout (PERMISSION_UI_TIMEOUT_MS) -> auto-deny.
 *   - Dialog unmounts / backdrop click / Esc all behave like Deny.
 */

import { useEffect, useRef, useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Keep in sync with main `PERMISSION_TIMEOUT_MS` / `permission-actions.ts`. */
const PERMISSION_UI_TIMEOUT_MS = 120_000;

export interface ExperimentsRunConfirmModalProps {
  open: boolean;
  /** Command being approved — read-only display. */
  command: string;
  /** Project-relative working directory (e.g. `experiment/exp-xxx`). */
  cwd: string;
  /** Invoked when the user clicks Allow. The modal closes itself. */
  onAllow: () => void;
  /** Invoked when the user clicks Deny, the timeout fires, or the dialog
   *  is dismissed (backdrop / Esc / close button). */
  onDeny: () => void;
}

export function ExperimentsRunConfirmModal({
  open,
  command,
  cwd,
  onAllow,
  onDeny,
}: ExperimentsRunConfirmModalProps) {
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

  // 120s auto-deny — mirrors the agent's `PERMISSION_UI_TIMEOUT_MS` so
  // the UI path stays in lock-step with the chat-driven path.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!settledRef.current) {
        settledRef.current = true;
        onDeny();
      }
    }, PERMISSION_UI_TIMEOUT_MS);
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
    onDeny();
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
          onDeny();
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
            onDeny();
          }
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-warning" aria-hidden />
            Confirm experiment run
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p className="text-[length:var(--font-size-13)] text-foreground/85">
                This will execute a shell command in the experiment lab
                directory. The run is recorded in{" "}
                <span className="font-mono">runs.jsonl</span> with the
                current environment snapshot.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-[length:var(--font-size-12)]">
          <div className="space-y-1">
            <div className="text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/70">
              Command
            </div>
            <pre
              className={cn(
                "max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40",
                "px-2 py-1.5 font-mono text-[length:var(--font-size-12)] text-foreground/90",
                "whitespace-pre-wrap break-words",
              )}
            >
              {command || "(empty)"}
            </pre>
          </div>
          <div className="space-y-1">
            <div className="text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/70">
              Working directory
            </div>
            <div
              className={cn(
                "truncate rounded-md border border-border/60 bg-muted/30 px-2 py-1",
                "font-mono text-[length:var(--font-size-12)] text-foreground/80",
              )}
              title={cwd}
            >
              {cwd || "—"}
            </div>
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
            Deny
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
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CountdownProgress — 120s linear progress bar that auto-resets on
 * `active` toggling. Indeterminate at the moment-of-render, so we
 * drive value from a setInterval to keep things simple and avoid
 * pulling in a CSS-only animation.
 */
function CountdownProgress({ active }: { active: boolean }) {
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
      const pct = Math.min(100, (elapsed / PERMISSION_UI_TIMEOUT_MS) * 100);
      setValue(pct);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  const remaining = Math.max(
    0,
    Math.ceil((PERMISSION_UI_TIMEOUT_MS - (value / 100) * PERMISSION_UI_TIMEOUT_MS) / 1000),
  );

  return (
    <div className="space-y-1">
      <Progress
        value={value}
        aria-label="Auto-deny countdown"
        className="h-1"
      />
      <p className="text-[length:var(--font-hint)] text-muted-foreground/60">
        Auto-deny in {remaining}s
      </p>
    </div>
  );
}

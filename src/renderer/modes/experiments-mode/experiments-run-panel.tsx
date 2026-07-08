/**
 * experiments-run-panel — Run panel for the Experiments mode detail view
 * (Sprint 0.7, Task 6).
 *
 * Replaces the Task 5 placeholder. Provides the human equivalent of the
 * Agent's `experiment-run` tool: a command input + Run button that goes
 * through the SAME executor (single source of truth — the store's
 * `runCommand` calls `experiment:run` IPC, which the main handler feeds
 * into `kickoffExperimentRun`).
 *
 * Permission gating (D3):
 *
 *   `shouldShowPermissionGate(permissionMode, "experiment-run")` is a
 *   pure renderer-side function that returns `true` in ask / auto modes
 *   (because the SHELL rules map both modes to "ask" for the
 *   `experiment-run` tool) and `false` in readonly mode. We consult it
 *   before launching the modal:
 *
 *     - gate false (readonly)          -> Run button is disabled
 *     - gate false (mode says allow)   -> run immediately, no modal
 *     - gate true  (ask / auto)        -> open the mode-internal
 *                                          confirm modal, 120s auto-deny
 *
 *   The main `experiment:run` handler re-validates with
 *   `resolvePermissionAction` (readonly -> deny) as a backstop, so a
 *   bypassed renderer modal still cannot start a run in readonly mode.
 *
 * P0 scope:
 *   - command input + Reuse last + Run
 *   - mode-internal confirm modal with 120s timeout
 *   - in-flight state with Cancel
 *   - per-run only (no "Always allow in this project" toggle — that's
 *     a permission-mode change, lives in Settings)
 */

import { useCallback, useMemo, useState } from "react";
import {
  HistoryIcon,
  Loader2Icon,
  PlayIcon,
  SquareIcon,
  TerminalIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useSettingsStore } from "@/stores/settings-store";
import { shouldShowPermissionGate } from "@/components/modules/chat/permission-gate-panel";
import { resolvePermissionMode } from "@shared/permission-modes";

import { ExperimentsRunConfirmModal } from "./experiments-run-confirm-modal";

export function ExperimentsRunPanel() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const runs = useExperimentStore((s) => s.detail?.runs);
  const runInFlight = useExperimentStore((s) => s.runInFlight);
  const runCommand = useExperimentStore((s) => s.runCommand);
  const cancelRun = useExperimentStore((s) => s.cancelRun);

  // Permission mode — feeds the gate predicate and the readonly check.
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const resolvedMode = resolvePermissionMode(permissionMode);
  const isReadonly = resolvedMode === "readonly";

  // Most recent run's command, used to populate the input via the
  // "Reuse last command" button. `runs[].length - 1` is the most
  // recent because the executor appends to runs.jsonl in order, and
  // `handleRunComplete` mirrors that in the in-memory detail.
  const lastCommand = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    return runs[runs.length - 1]?.command ?? null;
  }, [runs]);

  const [command, setCommand] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The command snapshot the modal is gating on — captured when the
  // modal opens so user edits in the textarea don't race the modal.
  const [pendingCommand, setPendingCommand] = useState("");

  const canRun =
    Boolean(projectRoot) &&
    Boolean(selectedId) &&
    command.trim().length > 0 &&
    !runInFlight &&
    !isReadonly;

  const handleRunClick = useCallback(() => {
    if (!canRun || !projectRoot || !selectedId) return;
    const trimmed = command.trim();
    const showGate = shouldShowPermissionGate(permissionMode, "experiment-run");
    if (showGate) {
      setPendingCommand(trimmed);
      setConfirmOpen(true);
      return;
    }
    // Mode says allow (or no gate) — fire immediately.
    void runCommand(projectRoot, selectedId, trimmed);
  }, [canRun, command, permissionMode, projectRoot, runCommand, selectedId]);

  const handleAllow = useCallback(() => {
    if (!projectRoot || !selectedId) return;
    setConfirmOpen(false);
    void runCommand(projectRoot, selectedId, pendingCommand);
  }, [pendingCommand, projectRoot, runCommand, selectedId]);

  const handleDeny = useCallback(() => {
    // Closing the modal is the only effect — we do not call runCommand.
    setConfirmOpen(false);
    setPendingCommand("");
  }, []);

  const handleCancel = useCallback(() => {
    if (!projectRoot || !selectedId || !runInFlight) return;
    void cancelRun(projectRoot, selectedId, runInFlight.runId);
  }, [cancelRun, projectRoot, runInFlight, selectedId]);

  const handleReuseLast = useCallback(() => {
    if (lastCommand == null) return;
    setCommand(lastCommand);
  }, [lastCommand]);

  const isInFlightForCurrent = Boolean(
    runInFlight && selectedId && runInFlight.id === selectedId,
  );

  const cwd = useExperimentStore((s) => s.detail?.meta.workspacePath) ?? "";

  return (
    <section
      aria-label="Run panel"
      data-experiments-run-panel="true"
      className={cn(
        "rounded-md border border-border/60 bg-card/40",
      )}
    >
      <header className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
        <span className="text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/70">
          Run panel
        </span>
        {isInFlightForCurrent ? (
          <span
            className="inline-flex items-center gap-1 text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-info"
            aria-live="polite"
          >
            <Loader2Icon className="size-3 animate-spin" aria-hidden />
            Running
          </span>
        ) : (
          <span className="text-[length:var(--font-hint)] uppercase tracking-wide text-muted-foreground/55">
            {isReadonly ? "read-only mode" : resolvedMode}
          </span>
        )}
      </header>

      <div className="space-y-2 px-3 py-2">
        <Textarea
          aria-label="Command"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder=".venv/bin/python train.py --epochs 50"
          spellCheck={false}
          disabled={isInFlightForCurrent}
          rows={3}
          className={cn(
            "min-h-[64px] resize-y font-mono text-[length:var(--font-size-12)]",
            "border-border/60 bg-background/80",
          )}
          onKeyDown={(e) => {
            // Enter triggers Run; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canRun) handleRunClick();
            }
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleRunClick}
              disabled={!canRun}
              className="h-7 gap-1 px-2.5 text-[length:var(--font-size-12)]"
              title={
                isReadonly
                  ? "Permission mode is read-only — experiment runs are disabled."
                  : !projectRoot || !selectedId
                    ? "Select an experiment to run a command."
                    : command.trim().length === 0
                      ? "Enter a command to run."
                      : "Run command in lab"
              }
            >
              <PlayIcon className="size-3" aria-hidden />
              Run
            </Button>
            {isInFlightForCurrent ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCancel}
                className="h-7 gap-1 px-2.5 text-[length:var(--font-size-12)]"
                title="Cancel the in-flight run"
              >
                <SquareIcon className="size-3" aria-hidden />
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleReuseLast}
              disabled={lastCommand == null || isInFlightForCurrent}
              className="h-7 gap-1 px-2 text-[length:var(--font-size-12)]"
              title={
                lastCommand == null
                  ? "No prior runs to reuse."
                  : "Populate the command from the most recent run"
              }
            >
              <HistoryIcon className="size-3" aria-hidden />
              Reuse last command
            </Button>
          </div>
          {isInFlightForCurrent && runInFlight ? (
            <code
              className={cn(
                "max-w-[60%] truncate text-[length:var(--font-hint)]",
                "rounded bg-muted/60 px-1.5 py-0.5 text-muted-foreground/80",
              )}
              title={runInFlight.command}
            >
              {runInFlight.runId}
            </code>
          ) : null}
        </div>

        {cwd ? (
          <div className="flex items-center gap-1 truncate text-[length:var(--font-hint)] text-muted-foreground/60">
            <TerminalIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate font-mono" title={cwd}>
              cwd: {cwd}
            </span>
          </div>
        ) : null}
      </div>

      <ExperimentsRunConfirmModal
        open={confirmOpen}
        command={pendingCommand}
        cwd={cwd}
        onAllow={handleAllow}
        onDeny={handleDeny}
      />
    </section>
  );
}

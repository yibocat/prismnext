/**
 * experiments-provenance-inspector — modal that traces an artifact chip back
 * to the run that produced it (command, env, exit, chat session).
 *
 * Honesty contract: when no run claimed the file, show an explicit empty state
 * rather than guessing a nearby run.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CopyIcon,
  ExternalLinkIcon,
  Link2Icon,
  Loader2Icon,
  MessageSquareIcon,
  MessagesSquareIcon,
  PenLineIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { CopyFeedbackButton } from "@/modes/literature-mode/literature-inline-field";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { insertExperimentRunToChat } from "@/lib/chat/insert-to-chat";
import {
  experimentsCodeClass,
  experimentsMetadataLabelClass,
  experimentsPathValueClass,
  experimentsSectionLabelClass,
  experimentsUiValueClass,
} from "./experiments-detail-chrome";
import { openArtifactPathInFiles } from "./experiments-artifact-nav";
import { useExperimentProjectRoot } from "./experiments-project-root";
import type {
  ProvenanceLinkMethod,
  ProvenanceRunRecorded,
} from "../../../shared/provenance";

export interface ExperimentsProvenanceInspectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Raw artifact path as stored in `run.artifacts` / provenance (project-relative). */
  artifactPath: string;
  /** Experiment workspace path, to build the full path for "Open in Files". */
  workspacePath?: string;
}

function formatDuration(startedAt: string, finishedAt: string): string | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-3 py-1">
      <span className={cn(experimentsMetadataLabelClass, "pt-0.5")}>{label}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function ExperimentsProvenanceInspector({
  open,
  onOpenChange,
  artifactPath,
  workspacePath,
}: ExperimentsProvenanceInspectorProps) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const [resolved, setResolved] = useState<{
    run: ProvenanceRunRecorded;
    linkMethod: ProvenanceLinkMethod;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !artifactPath || !projectRoot) {
      setResolved(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setResolved(null);
    window.electronAPI
      .provenanceGetForArtifact(projectRoot, artifactPath)
      .then((result) => {
        if (cancelled) return;
        setResolved(result);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, artifactPath, projectRoot]);

  const run = resolved?.run ?? null;
  const duration = run ? formatDuration(run.startedAt, run.finishedAt) : null;
  const link =
    resolved == null
      ? null
      : resolved.linkMethod === "explicit"
        ? {
            label: t("experiments.provenance.declared"),
            tone: "text-success",
          }
        : {
            label: t("experiments.provenance.inferred"),
            tone: "text-warning",
          };

  const handleOpenInFiles = () => {
    void openArtifactPathInFiles(artifactPath, workspacePath);
    onOpenChange(false);
  };

  const handleOpenChatSession = (sessionId: string) => {
    useLayoutStore.getState().unmaximizeRightArea();
    void useChatStore.getState().loadSession(sessionId);
    onOpenChange(false);
  };

  const handleDiscussInChat = () => {
    if (!run) return;
    insertExperimentRunToChat({
      runId: run.runId,
      experimentId: run.experimentId ?? undefined,
      command: run.command,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      artifactPath: artifactPath || undefined,
      linkMethod: resolved?.linkMethod,
      artifacts: run.artifacts ?? [],
      artifactSnapshots: run.artifactSnapshots,
      env: run.env,
      chatSessionId: run.chatSessionId ?? null,
      workspacePath,
      intent: "discuss",
    });
    onOpenChange(false);
  };

  const handleUseInPaper = () => {
    if (!run) return;
    insertExperimentRunToChat({
      runId: run.runId,
      experimentId: run.experimentId ?? undefined,
      command: run.command,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      artifactPath: artifactPath || undefined,
      linkMethod: resolved?.linkMethod,
      artifacts: run.artifacts ?? [],
      artifactSnapshots: run.artifactSnapshots,
      env: run.env,
      chatSessionId: run.chatSessionId ?? null,
      workspacePath,
      intent: "cite-in-paper",
    });
    onOpenChange(false);
  };

  const pythonLabel = run?.env.python
    ? [run.env.python, run.env.pythonVersion].filter(Boolean).join(" · ")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full gap-4 font-sans sm:max-w-2xl">
        <DialogHeader className="gap-1.5 pr-6 text-left">
          <DialogTitle className="flex items-center gap-2 text-[length:var(--font-dialog-title)] font-semibold">
            <Link2Icon className="size-3.5 text-muted-foreground" aria-hidden />
            {t("experiments.provenance.title")}
          </DialogTitle>
          <DialogDescription className="text-[length:var(--font-dialog-label)] text-muted-foreground">
            {t("experiments.provenance.desc")}
          </DialogDescription>
        </DialogHeader>

        <p
          className={cn(
            "rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5",
            experimentsPathValueClass,
          )}
        >
          {artifactPath || t("experiments.provenance.noPath")}
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-[length:var(--font-dialog-label)] text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            {t("experiments.provenance.resolving")}
          </div>
        ) : !run ? (
          <div className="rounded-md border border-dashed border-border/60 px-4 py-5 text-center">
            <p className={SETTINGS_ROW_DESC}>{t("experiments.provenance.noRun")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className={experimentsSectionLabelClass}>{t("experiments.command")}</div>
              <div className="relative min-w-0">
                <pre
                  className={cn(
                    "rounded-md border border-border/60 bg-muted/30",
                    "px-2.5 py-1.5 pr-8 whitespace-pre-wrap break-words",
                    experimentsCodeClass,
                  )}
                >
                  {run.command || t("experiments.runConfirm.empty")}
                </pre>
                <CopyFeedbackButton
                  onCopy={() => navigator.clipboard.writeText(run.command)}
                  title={t("experiments.provenance.copyCommand")}
                  className="absolute top-1.5 right-1.5 rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                >
                  <CopyIcon className="size-3" aria-hidden />
                </CopyFeedbackButton>
              </div>
            </div>

            <div className="space-y-0">
              <MetaRow label={t("experiments.exit")}>
                <span
                  className={cn(
                    experimentsUiValueClass,
                    "tabular-nums",
                    run.exitCode === 0
                      ? "text-success"
                      : "text-destructive",
                  )}
                >
                  {run.exitCode}
                </span>
              </MetaRow>
              <MetaRow label={t("experiments.provenance.duration")}>
                <span className={cn(experimentsUiValueClass, "tabular-nums")}>
                  {duration ?? "—"}
                </span>
              </MetaRow>
              <MetaRow label={t("experiments.provenance.link")}>
                {link ? (
                  <span className={cn(experimentsUiValueClass, "font-medium", link.tone)}>
                    {link.label}
                  </span>
                ) : null}
              </MetaRow>
              <MetaRow label={t("experiments.run")}>
                <span className={experimentsCodeClass}>{run.runId}</span>
              </MetaRow>
              <MetaRow label={t("experiments.provenance.python")}>
                <span className={experimentsPathValueClass}>
                  {pythonLabel ?? t("experiments.provenance.notDetected")}
                </span>
              </MetaRow>
              <MetaRow label={t("experiments.provenance.platform")}>
                <span className={experimentsUiValueClass}>{run.env.platform}</span>
              </MetaRow>
              <MetaRow label={t("experiments.provenance.git")}>
                <span className={experimentsUiValueClass}>
                  {run.env.gitCommit ?? t("experiments.provenance.notRepo")}
                </span>
              </MetaRow>
            </div>

            <div className="flex min-w-0 items-start gap-2 border-t border-border/40 pt-2.5">
              <MessageSquareIcon
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60"
                aria-hidden
              />
              {run.chatSessionId ? (
                <Hint label={t("experiments.provenance.openSession", { id: run.chatSessionId })}>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-auto max-w-full whitespace-normal px-1.5 py-0.5 text-left font-mono text-[length:var(--font-code)]"
                    onClick={() => handleOpenChatSession(run.chatSessionId!)}
                  >
                    <span className="break-all">{run.chatSessionId}</span>
                  </Button>
                </Hint>
              ) : (
                <span className="text-[length:var(--font-dialog-label)] text-muted-foreground/70">
                  {t("experiments.provenance.noChat")}
                </span>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("experiments.close")}
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleOpenInFiles}
              disabled={!artifactPath}
            >
              <ExternalLinkIcon className="size-3.5" aria-hidden />
              {t("experiments.provenance.openInFiles")}
            </Button>
            <Hint label={t("experiments.provenance.sendArtifact")}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleDiscussInChat}
                disabled={!run}
              >
                <MessagesSquareIcon className="size-3.5" aria-hidden />
                {t("experiments.provenance.discuss")}
              </Button>
            </Hint>
            <Hint label={t("experiments.provenance.sendDraft")}>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleUseInPaper}
                disabled={!run}
              >
                <PenLineIcon className="size-3.5" aria-hidden />
                {t("experiments.runs.useInPaper")}
              </Button>
            </Hint>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

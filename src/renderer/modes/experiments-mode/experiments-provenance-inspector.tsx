/**
 * experiments-provenance-inspector - modal that traces an artifact chip back to
 * the run that produced it (command, env, exit, chat session).
 *
 * Honesty contract: when no run claimed the file, show an explicit empty state
 * ("may have been copied manually") rather than guessing a nearby run.
 *
 * Design: docs/superpowers/specs/2026-07-11-provenance-lite-design.md §7.1
 */
import { useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Link2Icon,
  Loader2Icon,
  MessageSquareIcon,
  MessagesSquareIcon,
} from "lucide-react";

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
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { insertExperimentRunToChat } from "@/lib/chat/insert-to-chat";
import {
  experimentsCodeClass,
  experimentsMetadataLabelClass,
  experimentsMetadataRowClass,
  experimentsUiValueClass,
} from "./experiments-detail-chrome";
import { artifactFullPath, openArtifactInFiles } from "./experiments-artifact-nav";
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

const COPY_FEEDBACK_MS = 1500;

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

function linkMethodLabel(method: ProvenanceLinkMethod): { label: string; tone: string } {
  return method === "explicit"
    ? { label: "Declared artifact", tone: "text-emerald-600 dark:text-emerald-400" }
    : { label: "Inferred by mtime", tone: "text-amber-600 dark:text-amber-400" };
}

export function ExperimentsProvenanceInspector({
  open,
  onOpenChange,
  artifactPath,
  workspacePath,
}: ExperimentsProvenanceInspectorProps) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [resolved, setResolved] = useState<{
    run: ProvenanceRunRecorded;
    linkMethod: ProvenanceLinkMethod;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const link = resolved ? linkMethodLabel(resolved.linkMethod) : null;

  const handleCopyCommand = async () => {
    if (!resolved) return;
    await navigator.clipboard.writeText(resolved.run.command);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  const handleOpenInFiles = () => {
    openArtifactInFiles(artifactFullPath(artifactPath, workspacePath));
    onOpenChange(false);
  };

  /** Jump to the chat tab that started the run (creates + loads it if closed). */
  const handleOpenChatSession = (sessionId: string) => {
    // Need the center chat list visible to show that session's history.
    useLayoutStore.getState().unmaximizeRightArea();
    void useChatStore.getState().loadSession(sessionId);
    onOpenChange(false);
  };

  /**
   * Push run context into the composer. When RightArea is maximized, leave it
   * maximized — insertContextToChat targets the AiBar capsule (not the center chat).
   */
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
      env: run.env,
      chatSessionId: run.chatSessionId ?? null,
      workspacePath,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(90vh,36rem)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0",
          "sm:max-w-lg",
        )}
      >
        <DialogHeader className="shrink-0 space-y-2 px-6 pt-6 pb-3 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Link2Icon className="size-4 text-muted-foreground" aria-hidden />
            Artifact provenance
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 min-w-0">
              <p className="text-[length:var(--font-size-12)] text-foreground/80">
                Trace this file back to the run that produced it.
              </p>
              <p className={cn("truncate", experimentsCodeClass)} title={artifactPath}>
                {artifactPath || "(no path)"}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden /> Resolving provenance…
            </div>
          ) : !run ? (
            <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-[length:var(--font-size-13)] text-muted-foreground/80">
              No run recorded for this file - it may have been copied manually.
            </div>
          ) : (
            <div className="min-w-0 space-y-3 pb-2 text-[length:var(--font-size-12)]">
              <div className="space-y-1">
                <div className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/70">
                  Command
                </div>
                <div className="relative min-w-0">
                  <pre
                    className={cn(
                      "max-h-32 overflow-auto rounded-md border border-border/60 bg-muted/40",
                      "px-2 py-1.5 pr-8 whitespace-pre-wrap break-words",
                      experimentsCodeClass,
                    )}
                  >
                    {run.command || "(empty)"}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    title="Copy command"
                    className="absolute top-1.5 right-1.5 rounded bg-background/90 p-0.5 text-muted-foreground/60 shadow-sm hover:bg-muted hover:text-foreground"
                  >
                    {copied ? (
                      <CheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    ) : (
                      <CopyIcon className="size-3" aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 min-w-0">
                <div className={experimentsMetadataRowClass}>
                  <span className={experimentsMetadataLabelClass}>Exit</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      run.exitCode === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {run.exitCode}
                  </span>
                </div>
                <div className={experimentsMetadataRowClass}>
                  <span className={experimentsMetadataLabelClass}>Duration</span>
                  <span className="tabular-nums">{duration ?? "-"}</span>
                </div>
                <div className={experimentsMetadataRowClass}>
                  <span className={experimentsMetadataLabelClass}>Link</span>
                  {link ? (
                    <span className={cn("font-medium", link.tone)}>{link.label}</span>
                  ) : null}
                </div>
                <div className={cn(experimentsMetadataRowClass, "min-w-0")}>
                  <span className={experimentsMetadataLabelClass}>Run</span>
                  <span className={cn("truncate", experimentsCodeClass)} title={run.runId}>
                    {run.runId}
                  </span>
                </div>
              </div>

              <div className="space-y-1 min-w-0">
                <div className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/70">
                  Environment
                </div>
                <div className="min-w-0 rounded-md border border-border/60 bg-muted/20 px-3 py-1.5">
                  <div className={cn(experimentsMetadataRowClass, "min-w-0")}>
                    <span className={experimentsMetadataLabelClass}>Python</span>
                    <span
                      className={cn(experimentsUiValueClass, "truncate")}
                      title={
                        run.env.python
                          ? [run.env.python, run.env.pythonVersion].filter(Boolean).join(" · ")
                          : undefined
                      }
                    >
                      {run.env.python
                        ? [run.env.python, run.env.pythonVersion].filter(Boolean).join(" · ")
                        : "not detected"}
                    </span>
                  </div>
                  <div className={experimentsMetadataRowClass}>
                    <span className={experimentsMetadataLabelClass}>Platform</span>
                    <span className={experimentsUiValueClass}>{run.env.platform}</span>
                  </div>
                  <div className={experimentsMetadataRowClass}>
                    <span className={experimentsMetadataLabelClass}>Git</span>
                    <span className={experimentsUiValueClass}>
                      {run.env.gitCommit ?? "not a repo"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground/70">
                <MessageSquareIcon className="size-3 shrink-0" aria-hidden />
                {run.chatSessionId ? (
                  <button
                    type="button"
                    onClick={() => handleOpenChatSession(run.chatSessionId!)}
                    className="inline-flex min-w-0 items-center gap-0.5 truncate rounded text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    title={`Open chat session ${run.chatSessionId}`}
                  >
                    <span className={cn("truncate", experimentsCodeClass)}>
                      {run.chatSessionId}
                    </span>
                    <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
                  </button>
                ) : (
                  <span>No chat session linked (run was not started from a chat tab).</span>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-border/50 bg-background px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenInFiles}
            disabled={!artifactPath}
          >
            <ExternalLinkIcon className="size-3.5" aria-hidden />
            Open in Files
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleDiscussInChat}
            disabled={!run}
            title="Send this run + artifact to the AiBar / chat composer"
          >
            <MessagesSquareIcon className="size-3.5" aria-hidden />
            Discuss in chat
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

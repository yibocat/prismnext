/**
 * experiments-runs-table — Runs timeline for the Experiments mode detail
 * view (Sprint 0.7, Task 5).
 *
 * Read-only table over `ExperimentRunEntry[]`. Columns:
 *   time · command (truncated) · exitCode (color-coded) · env summary
 *
 * Each row is expandable to reveal:
 *   - the **single** "output" tail (`stdoutTail` only; `stderrTail` is
 *     ALWAYS empty in the current executor because node-pty merges
 *     stderr into stdout — see plan §FAQ / D2. We deliberately do NOT
 *     render a separate stderr column, and the field is intentionally
 *     ignored in the type, to prevent misleading UI.)
 *   - artifact paths, each rendered as a clickable button. Click is
 *     wired to `navigateFileTreeToPath` + `openFile` on the resolved
 *     project-relative path. Full file-tree reveal is left to Task 7
 *     (the click handler delegates to a best-effort open that gracefully
 *     no-ops if the path is outside the scanned tree).
 *
 * Mirrors the literature-mode visual language: small monospace tabular
 * numerics, chevron for expand, shadcn/ui where applicable.
 */

import { useState } from "react";
import {
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  TerminalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";
import type {
  ExperimentEnv,
  ExperimentRunEntry,
} from "../../../shared/experiment-log";

export interface ExperimentsRunsTableProps {
  runs: ExperimentRunEntry[];
  /** Project-relative workspace path (meta.workspacePath) - used to resolve
   *  island-relative artifact paths for file-tree reveal + editor open. */
  workspacePath?: string;
}

const TABLE_HEAD =
  "sticky top-0 z-10 grid grid-cols-[6.5rem_1fr_3.25rem_5.5rem] items-center gap-2 border-b border-border/60 bg-background/95 px-2 py-1 text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/70 backdrop-blur-sm";

function envSummary(env: ExperimentEnv): string {
  const py = env.pythonVersion ? `py ${env.pythonVersion}` : "no python";
  const r = env.rVersion ? `R ${env.rVersion}` : null;
  return r ? `${py} · ${r}` : py;
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  // Compact locale-friendly timestamp; matches the literature-mode convention.
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Single clickable artifact row — opens the file in the editor + reveals
 *  it in the Files sidebar tree. Falls back silently on paths the file
 *  scanner hasn't seen yet (e.g. freshly created artifacts). */
function ArtifactRow({ path, workspacePath }: { path: string; workspacePath?: string }) {
  const [opened, setOpened] = useState<"idle" | "ok" | "missing">("idle");
  const openFile = useDocumentStore((s) => s.openFile);

  // Artifacts are stored relative to the workspace island (per schema);
  // join with meta.workspacePath to get a project-relative path for the
  // file tree + editor. If the path already starts with the workspace
  // prefix (already project-relative), use it as-is.
  const fullPath =
    workspacePath && !path.startsWith(workspacePath) ? `${workspacePath}/${path}` : path;

  const handleClick = async () => {
    if (!fullPath) return;
    // Ensure Files mode is the right-panel surface so the click has a
    // visible target. activateMode is a no-op if already on Files.
    useLayoutStore.getState().activateMode("files");
    // Reveal in sidebar (best-effort — non-scanned paths simply won't match).
    navigateFileTreeToPath(fullPath);
    try {
      await openFile(fullPath);
      setOpened("ok");
    } catch {
      setOpened("missing");
    }
  };

  const name = path.split("/").pop() ?? path;
  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left",
        "text-[length:var(--font-size-12)] text-foreground/80",
        "hover:bg-accent/60 hover:text-foreground",
      )}
      title={path}
    >
      <ExternalLinkIcon
        className="size-3 shrink-0 text-muted-foreground/60 group-hover:text-foreground/80"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{name}</span>
        {path !== name ? (
          <span className="ml-1.5 truncate text-muted-foreground/60">
            {path}
          </span>
        ) : null}
      </span>
      {opened === "missing" ? (
        <span className="shrink-0 text-[length:var(--font-hint)] text-muted-foreground/60">
          not in tree
        </span>
      ) : null}
    </button>
  );
}

function RunRow({ run, workspacePath }: { run: ExperimentRunEntry; workspacePath?: string }) {
  const [open, setOpen] = useState(false);
  const exit = run.exitCode;
  const ExitIcon = exit === 0 ? CircleCheckIcon : CircleXIcon;
  const exitClass =
    exit === 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";
  const summary = envSummary(run.env);
  const hasTail = run.stdoutTail && run.stdoutTail.trim().length > 0;
  const hasArtifacts = run.artifacts.length > 0;
  const expandable = hasTail || hasArtifacts;

  return (
    <li
      className={cn(
        "border-b border-border/40 last:border-b-0",
        open && "bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        aria-expanded={open}
        className={cn(
          "grid w-full grid-cols-[6.5rem_1fr_3.25rem_5.5rem] items-center gap-2 px-2 py-1.5 text-left",
          "text-[length:var(--font-size-12)]",
          expandable && "hover:bg-accent/40",
          !expandable && "cursor-default",
        )}
      >
        <ChevronRightIcon
          className={cn(
            "col-start-1 size-3 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
            !expandable && "opacity-0",
          )}
          aria-hidden
        />
        <time
          dateTime={run.finishedAt}
          className="col-start-1 row-start-1 col-span-1 -ml-0 tabular-nums text-muted-foreground/80"
          title={run.finishedAt}
        >
          {formatTime(run.finishedAt)}
        </time>
        <span
          className="col-start-2 row-start-1 truncate font-mono text-foreground/90"
          title={run.command}
        >
          {truncate(run.command, 140)}
        </span>
        <span
          className={cn(
            "col-start-3 row-start-1 flex items-center gap-1 tabular-nums",
            exitClass,
          )}
          title={`exit code ${exit}`}
        >
          <ExitIcon className="size-3" aria-hidden />
          <span>{exit}</span>
        </span>
        <span
          className="col-start-4 row-start-1 truncate text-muted-foreground/70"
          title={summary}
        >
          {summary || "—"}
        </span>
      </button>

      {open ? (
        <div className="space-y-2 px-3 pb-2 pt-0.5">
          {hasTail ? (
            <pre
              className={cn(
                "max-h-64 overflow-auto rounded-sm border border-border/60 bg-background/80",
                "px-2 py-1.5 font-mono text-[length:var(--font-size-11)] text-foreground/85",
                "whitespace-pre-wrap break-words",
              )}
            >
              {run.stdoutTail}
            </pre>
          ) : null}

          {hasArtifacts ? (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[length:var(--font-hint)] uppercase tracking-wide text-muted-foreground/70">
                <TerminalIcon className="size-3" aria-hidden />
                Artifacts ({run.artifacts.length})
              </div>
              <ul className="space-y-0.5">
                {run.artifacts.map((artifact) => (
                  <li key={artifact}>
                    <ArtifactRow path={artifact} workspacePath={workspacePath} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {run.notes && run.notes.trim() ? (
            <p className="text-[length:var(--font-hint)] text-muted-foreground/70">
              <span className="font-medium text-foreground/70">note:</span>{" "}
              {run.notes}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ExperimentsRunsTable({ runs, workspacePath }: ExperimentsRunsTableProps) {
  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-[length:var(--font-size-12)] text-muted-foreground/60">
        No runs yet. Use the run panel above to execute a command in this
        experiment.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className={TABLE_HEAD} role="row">
        <span role="columnheader" className="pl-5">
          Time
        </span>
        <span role="columnheader">
          Command
        </span>
        <span role="columnheader">Exit</span>
        <span role="columnheader">Env</span>
      </div>
      <ul className="divide-y divide-border/40">
        {runs.map((run) => (
          <RunRow key={run.runId} run={run} workspacePath={workspacePath} />
        ))}
      </ul>
    </div>
  );
}

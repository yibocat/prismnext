/**
 * Experiment sidebar panels — Overview + Environment for detail tabs.
 * Main detail pane stays Execution-focused.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { literatureDetailBadgeClass } from "@/modes/literature-mode/literature-list-chrome";
import {
  experimentEnvDisplayRows,
  type ExperimentEnv,
  type ExperimentMeta,
} from "../../../shared/experiment-log";
import {
  experimentsMetadataLabelClass,
  experimentsSectionHeaderRowClass,
  experimentsSectionLabelClass,
  experimentsUiValueClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";

const COPY_FEEDBACK_MS = 1500;

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}

function OverviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5 py-1.5">
      <div className={experimentsMetadataLabelClass}>{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CopyableText({
  text,
  copyText,
  className,
}: {
  text: string;
  copyText?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const payload = copyText ?? text;

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(payload).then(() => {
          setCopied(true);
          if (timerRef.current != null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
        });
      }}
      className={cn(
        "group inline-flex max-w-full items-baseline gap-1.5 text-left transition-colors",
        experimentsUiValueClass,
        "rounded-[3px] hover:text-foreground",
        className,
      )}
      title={copied ? "Copied" : `Click to copy: ${payload}`}
    >
      <span className="min-w-0 break-all">{text}</span>
      {copied ? (
        <CheckIcon className="size-3 shrink-0 self-center text-success" aria-label="Copied" />
      ) : (
        <CopyIcon
          className="size-3 shrink-0 self-center text-muted-foreground/45 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      )}
    </button>
  );
}

export function ExperimentsOverviewPanel({
  meta,
  runCount,
  lastRunAt,
  lastExitCode,
  compact,
}: {
  meta: ExperimentMeta;
  runCount: number;
  lastRunAt: string | null;
  lastExitCode: number | null;
  /** Tighter vertical rhythm for the mode sidebar. */
  compact?: boolean;
}) {
  return (
    <section className={cn("min-w-0", compact ? "space-y-1 px-1" : "space-y-2")}>
      {!compact ? (
        <h3 className={experimentsSectionLabelClass}>Overview</h3>
      ) : null}
      <div className="space-y-0 divide-y divide-border/40">
        <OverviewRow label="ID">
          <CopyableText text={meta.id} />
        </OverviewRow>
        <OverviewRow label="Created">
          <span className={experimentsUiValueClass}>
            {formatDateTime(meta.createdAt)}
            <span className="ml-1 text-muted-foreground/70">
              ({formatExperimentRelativeTime(meta.createdAt)})
            </span>
          </span>
        </OverviewRow>
        <OverviewRow label="Runs">
          <span className={cn(experimentsUiValueClass, "tabular-nums")}>
            {runCount}
            {lastRunAt ? (
              <span className="ml-1.5 text-[length:var(--font-size-12)] text-muted-foreground/80">
                · last {formatExperimentRelativeTime(lastRunAt)}
                {lastExitCode === 0 || lastExitCode == null ? "" : ` · exit ${lastExitCode}`}
              </span>
            ) : null}
          </span>
        </OverviewRow>
        <OverviewRow label="Lab path">
          <CopyableText text={meta.workspacePath} />
        </OverviewRow>
        {meta.tags && meta.tags.length > 0 ? (
          <OverviewRow label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {meta.tags.map((tag) => (
                <span key={tag} className={literatureDetailBadgeClass}>
                  {tag}
                </span>
              ))}
            </div>
          </OverviewRow>
        ) : null}
      </div>
    </section>
  );
}

export function ExperimentsEnvironmentPanel({
  env,
  reloading,
  onRefresh,
  compact,
}: {
  env: ExperimentEnv | null;
  reloading: boolean;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const rows = experimentEnvDisplayRows(env);

  return (
    <section className={cn("min-w-0", compact ? "space-y-1 px-1" : "space-y-2")}>
      <div className={experimentsSectionHeaderRowClass}>
        <h3 className={experimentsSectionLabelClass}>Environment</h3>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={reloading}
          title="Re-detect runtime environment"
        >
          {reloading ? (
            <Loader2Icon className="size-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCwIcon className="size-3" aria-hidden />
          )}
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      {!env ? (
        <p className={cn(SETTINGS_ROW_DESC, compact && "px-0 text-[length:var(--font-size-11)]")}>
          Not detected yet. Refresh probes Python, optional R, git, and venv.
        </p>
      ) : null}

      <div className="space-y-0 divide-y divide-border/40">
        {rows.map((row) => (
          <OverviewRow key={row.label} label={row.label}>
            {row.copyText ? (
              <CopyableText
                text={row.display?.trim() || row.placeholder}
                copyText={row.copyText}
              />
            ) : (
              <span
                className={cn(
                  experimentsUiValueClass,
                  !(row.display?.trim()) && "text-muted-foreground/60",
                )}
              >
                {row.display?.trim() || row.placeholder}
              </span>
            )}
          </OverviewRow>
        ))}
      </div>
    </section>
  );
}

/**
 * Experiment Overview & Environment — sparse label|value rows
 * (literature / Settings style). Tags use Literature-style chips.
 * Brief / hypothesis editing lives in the header brief strip, not here.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, CopyIcon, Loader2Icon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import {
  experimentEnvDisplayRows,
  experimentStatusOf,
  type ExperimentEnv,
  type ExperimentMeta,
} from "../../../shared/experiments/log";
import {
  experimentsMetadataLabelClass,
  experimentsSectionHeaderRowClass,
  experimentsSectionLabelClass,
  experimentsUiValueClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";
import { ExperimentsTags } from "./experiments-tags";

const COPY_FEEDBACK_MS = 1500;

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-3 gap-y-0.5 py-1.5",
        "@md:grid-cols-[5.25rem_minmax(0,1fr)] @md:items-center @md:gap-y-0",
      )}
    >
      <span className={experimentsMetadataLabelClass}>{label}</span>
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
  const { t } = useTranslation();
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
    <Hint
      label={
        copied
          ? t("common.copied")
          : t("experiments.detail.clickToCopy", { text: payload })
      }
    >
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
      >
        <span className="min-w-0 break-all">{text}</span>
        {copied ? (
          <CheckIcon
            className="size-3 shrink-0 self-center text-success"
            aria-label={t("common.copied")}
          />
        ) : (
          <CopyIcon
            className="size-3 shrink-0 self-center text-muted-foreground/45 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
      </button>
    </Hint>
  );
}

export function ExperimentsOverviewPanel({
  meta,
  runCount,
  lastRunAt,
  lastExitCode,
  onOpenExecution,
}: {
  meta: ExperimentMeta;
  runCount: number;
  lastRunAt: string | null;
  lastExitCode: number | null;
  onOpenExecution?: () => void;
}) {
  const { t } = useTranslation();
  const archived = experimentStatusOf(meta) === "archived";

  const runsLine = (() => {
    let line = String(runCount);
    if (lastRunAt) {
      line += ` ${t("experiments.overview.lastRun", {
        when: formatExperimentRelativeTime(lastRunAt),
      })}`;
      if (lastExitCode != null && lastExitCode !== 0) {
        line += ` ${t("experiments.overview.lastExit", { code: lastExitCode })}`;
      }
    }
    return line;
  })();

  return (
    <section className="min-w-0 space-y-2">
      <div className={experimentsSectionHeaderRowClass}>
        <h3 className={experimentsSectionLabelClass}>{t("experiments.overview.label")}</h3>
        {onOpenExecution ? (
          <Hint label={t("experiments.overview.openExecutionHint")}>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-muted-foreground hover:text-foreground"
              onClick={onOpenExecution}
            >
              <PlayIcon className="size-3" aria-hidden />
              <span className="text-[length:var(--font-size-11)]">
                {t("experiments.overview.openExecution")}
              </span>
            </Button>
          </Hint>
        ) : null}
      </div>

      <div className="divide-y divide-border/40">
        <MetaRow label={t("experiments.sidebar.status")}>
          <span className={experimentsUiValueClass}>
            {archived ? t("experiments.sidebar.archived") : t("experiments.sidebar.active")}
          </span>
        </MetaRow>

        <MetaRow label={t("experiments.overview.id")}>
          <CopyableText text={meta.id} />
        </MetaRow>

        <MetaRow label={t("experiments.overview.created")}>
          <span className={experimentsUiValueClass}>
            {formatDateTime(meta.createdAt)}
            <span className="ml-1.5 text-muted-foreground/70">
              ({formatExperimentRelativeTime(meta.createdAt)})
            </span>
          </span>
        </MetaRow>

        <MetaRow label={t("experiments.overview.runs")}>
          <span className={cn(experimentsUiValueClass, "tabular-nums")}>{runsLine}</span>
        </MetaRow>

        <MetaRow label={t("experiments.overview.labPath")}>
          <CopyableText text={meta.workspacePath} />
        </MetaRow>

        <MetaRow label={t("experiments.overview.tags")}>
          <ExperimentsTags experimentId={meta.id} tags={meta.tags ?? []} />
        </MetaRow>
      </div>
    </section>
  );
}

export function ExperimentsEnvironmentPanel({
  env,
  reloading,
  onRefresh,
}: {
  env: ExperimentEnv | null;
  reloading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const rows = experimentEnvDisplayRows(env);

  return (
    <section className="min-w-0 space-y-2">
      <div className={experimentsSectionHeaderRowClass}>
        <h3 className={experimentsSectionLabelClass}>{t("experiments.overview.environment")}</h3>
        <Hint label={t("experiments.overview.redetect")}>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={reloading}
          >
            {reloading ? (
              <Loader2Icon className="size-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCwIcon className="size-3" aria-hidden />
            )}
            <span className="sr-only">{t("experiments.refresh")}</span>
          </Button>
        </Hint>
      </div>

      {!env ? (
        <p className="py-1 text-[length:var(--font-size-12)] text-muted-foreground">
          {t("experiments.overview.envNotDetected")}
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {rows.map((row) => {
            const labelKey =
              row.label === "Python"
                ? "experiments.env.python"
                : row.label === "Platform"
                  ? "experiments.env.platform"
                  : row.label === "Venv"
                    ? "experiments.env.venv"
                    : row.label === "R"
                      ? "experiments.env.r"
                      : row.label === "Git"
                        ? "experiments.env.git"
                        : null;
            const placeholderKey =
              row.placeholder === "not detected"
                ? "experiments.env.notDetected"
                : row.placeholder === "unknown"
                  ? "experiments.env.unknown"
                  : row.placeholder === "no .venv"
                    ? "experiments.env.noVenv"
                    : null;
            const label = labelKey ? t(labelKey) : row.label;
            const placeholder = placeholderKey ? t(placeholderKey) : row.placeholder;
            const value = row.display?.trim() || placeholder;

            return (
              <MetaRow key={row.label} label={label}>
                {row.copyText ? (
                  <CopyableText text={value} copyText={row.copyText} />
                ) : (
                  <span
                    className={cn(
                      experimentsUiValueClass,
                      !(row.display?.trim()) && "text-muted-foreground/60",
                    )}
                  >
                    {value}
                  </span>
                )}
              </MetaRow>
            );
          })}
        </div>
      )}
    </section>
  );
}

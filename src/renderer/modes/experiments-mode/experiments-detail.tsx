/**
 * experiments-detail — Detail view for an experiment tab.
 * Temporarily hosts Overview + Environment (moved out of the mode sidebar);
 * layout of this page will be redesigned later.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AppMenu,
  AppMenuContent,
  AppMenuDestructiveItem,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { cn } from "@/lib/utils";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { useExperimentStore } from "@/stores/experiment-store";
import { literatureDetailBadgeClass } from "@/modes/literature-mode/literature-list-chrome";
import {
  experimentStatusOf,
  type ExperimentMeta,
  type ExperimentRunEntry,
} from "../../../shared/experiment-log";
import { ExperimentsBriefStrip } from "./experiments-brief-strip";
import {
  ExperimentsEnvironmentPanel,
  ExperimentsOverviewPanel,
} from "./experiments-overview";
import {
  experimentsDetailTitleClass,
  experimentsPathCompactClass,
  experimentsSectionHeaderRowClass,
  experimentsSectionLabelClass,
  experimentsSubsectionLabelClass,
  experimentsUiValueClass,
} from "./experiments-detail-chrome";
import { ExperimentsRunPanel } from "./experiments-run-panel";
import { ExperimentsRunsTable } from "./experiments-runs-table";

const COPY_FEEDBACK_MS = 1500;

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

  const handleCopy = () => {
    void navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    });
  };

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
        onClick={handleCopy}
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

function HistorySection({
  runCount,
  runs,
  workspacePath,
}: {
  runCount: number;
  runs: ExperimentRunEntry[];
  workspacePath: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-left"
        aria-expanded={open}
      >
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/60 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
          aria-hidden
        />
        <span className={experimentsSubsectionLabelClass}>
          {t("experiments.history")}
          <span className="ml-1.5 tabular-nums text-muted-foreground/65">({runCount})</span>
        </span>
      </button>
      {open ? (
        <ExperimentsRunsTable runs={runs} workspacePath={workspacePath} />
      ) : null}
    </div>
  );
}

export function ExperimentsDetail({ meta }: { meta: ExperimentMeta }) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const selectedId = useExperimentStore((s) => s.selectedId);
  const runs = useExperimentStore((s) => s.detail?.runs ?? []);
  const archiveExperiment = useExperimentStore((s) => s.archiveExperiment);
  const restoreExperiment = useExperimentStore((s) => s.restoreExperiment);
  const deleteExperiment = useExperimentStore((s) => s.deleteExperiment);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeLab, setRemoveLab] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = experimentStatusOf(meta);
  const archived = status === "archived";

  const handleArchiveToggle = useCallback(async () => {
    if (!projectRoot || !selectedId) return;
    const ok = archived
      ? await restoreExperiment(projectRoot, selectedId)
      : await archiveExperiment(projectRoot, selectedId);
    if (!ok) {
      toast.error(
        archived
          ? t("experiments.detail.restoreFailed")
          : t("experiments.detail.archiveFailed"),
      );
    }
  }, [
    archiveExperiment,
    archived,
    projectRoot,
    restoreExperiment,
    selectedId,
    t,
  ]);

  const handleDelete = useCallback(async () => {
    if (!projectRoot || !selectedId) return;
    setDeleting(true);
    try {
      const ok = await deleteExperiment(projectRoot, selectedId, { removeLab });
      if (!ok) {
        toast.error(t("experiments.detail.deleteFailed"));
        return;
      }
      setDeleteOpen(false);
      setRemoveLab(false);
    } finally {
      setDeleting(false);
    }
  }, [deleteExperiment, projectRoot, removeLab, selectedId, t]);

  const detailRunCount = useExperimentStore((s) => s.detail?.runCount);
  const lastRunAt = useExperimentStore((s) => s.detail?.lastRunAt ?? null);
  const runCount = detailRunCount ?? runs.length;
  const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const env = useExperimentStore((s) => s.env);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);
  const [envReloading, setEnvReloading] = useState(false);

  const handleRefreshEnv = useCallback(async () => {
    if (!projectRoot || !selectedId) return;
    setEnvReloading(true);
    try {
      await selectExperiment(projectRoot, selectedId);
    } finally {
      setEnvReloading(false);
    }
  }, [projectRoot, selectExperiment, selectedId]);

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-auto px-6 py-5 font-sans @md:px-8 @md:py-6">
      <div className="space-y-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className={experimentsDetailTitleClass}>{meta.title}</h2>
              {archived ? (
                <span className={literatureDetailBadgeClass}>{t("experiments.archived")}</span>
              ) : null}
            </div>
            <AppMenu>
              <Hint label={t("experiments.moreActions")}>
                <AppMenuTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="size-6 shrink-0 px-0"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </Button>
                </AppMenuTrigger>
              </Hint>
              <AppMenuContent align="end">
                <AppMenuItem onSelect={() => void handleArchiveToggle()}>
                  {archived ? t("experiments.restore") : t("experiments.archive")}
                </AppMenuItem>
                <AppMenuSeparator />
                <AppMenuDestructiveItem
                  onSelect={() => {
                    setRemoveLab(false);
                    setDeleteOpen(true);
                  }}
                >
                  {t("common.delete")}
                </AppMenuDestructiveItem>
              </AppMenuContent>
            </AppMenu>
          </div>
          <ExperimentsBriefStrip briefLinks={meta.briefLinks} />
        </header>

        <section className="space-y-3">
          <ExperimentsOverviewPanel
            meta={meta}
            runCount={runCount}
            lastRunAt={lastRunAt ?? lastRun?.finishedAt ?? null}
            lastExitCode={lastRun?.exitCode ?? null}
          />
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <ExperimentsEnvironmentPanel
            env={env}
            reloading={envReloading}
            onRefresh={() => void handleRefreshEnv()}
          />
        </section>

        <Dialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) setRemoveLab(false);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("dialogs.experiments.deleteTitle")}</DialogTitle>
            </DialogHeader>
            <p className={SETTINGS_ROW_DESC}>
              {t("experiments.detail.deleteBody", { title: meta.title })}
            </p>
            <label className="flex items-start gap-2 text-[length:var(--font-size-12)] text-muted-foreground">
              <Checkbox
                checked={removeLab}
                onCheckedChange={(v) => setRemoveLab(v === true)}
                className="mt-0.5"
              />
              <span>
                {t("experiments.detail.deleteLab", { path: meta.workspacePath })}
              </span>
            </label>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? t("common.deleting") : t("common.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="space-y-4 border-t border-border pt-4">
          <div className={cn(experimentsSectionHeaderRowClass, "items-baseline")}>
            <h3 className={experimentsSectionLabelClass}>{t("experiments.execution")}</h3>
            {meta.workspacePath ? (
              <div className="flex min-w-0 max-w-[55%] items-baseline justify-end gap-1.5">
                <span className="shrink-0 text-[length:var(--font-path)] text-muted-foreground/60">
                  cwd
                </span>
                <CopyableText
                  text={meta.workspacePath}
                  className={cn(
                    experimentsPathCompactClass,
                    "min-w-0 text-muted-foreground/75",
                  )}
                />
              </div>
            ) : null}
          </div>

          <ExperimentsRunPanel />

          <div className="space-y-2">
            <HistorySection runCount={runCount} workspacePath={meta.workspacePath} runs={runs} />
          </div>
        </section>
      </div>
    </div>
  );
}

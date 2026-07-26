/**
 * experiments-detail — Overview / Execution / Results panes.
 * Title + brief strip only on Overview. Execution is history-first (run via toolbar dialog).
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontalIcon, SquareIcon } from "lucide-react";
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
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
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
} from "./experiments-detail-chrome";
import { ExperimentsRunsTable } from "./experiments-runs-table";
import { ExperimentsResultsPanel } from "./experiments-results-panel";

type DetailPane = "overview" | "run" | "results";

function HistorySection({
  runs,
  workspacePath,
  onOpenResults,
}: {
  runCount: number;
  runs: ExperimentRunEntry[];
  workspacePath: string;
  onOpenResults?: (runId: string) => void;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const selectedId = useExperimentStore((s) => s.selectedId);
  const runInFlight = useExperimentStore((s) => s.runInFlight);
  const cancelRun = useExperimentStore((s) => s.cancelRun);
  const live =
    runInFlight && selectedId && runInFlight.id === selectedId ? runInFlight : null;

  return (
    <div className="flex min-h-0 flex-col">
      {live ? (
        <div className="border-b border-border/60">
          <div className="flex h-[var(--height-right-area-subtoolbar)] items-center gap-2 px-3">
            <span className="text-[length:var(--font-size-11)] font-medium text-info">
              {t("experiments.running")}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--font-code)] text-foreground/85">
              {live.command}
            </span>
            <Hint label={t("experiments.runPanel.cancelRun")}>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-6 shrink-0 gap-1 px-2"
                onClick={() => {
                  if (!projectRoot || !selectedId) return;
                  void cancelRun(projectRoot, selectedId, live.runId);
                }}
              >
                <SquareIcon className="size-3" aria-hidden />
                {t("experiments.cancel")}
              </Button>
            </Hint>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-border/40 px-3 py-2 font-mono text-[length:var(--font-code)] text-foreground/80">
            {live.liveOutput.trim()
              ? live.liveOutput
              : t("experiments.runPanel.waitingOutput")}
          </pre>
        </div>
      ) : null}
      <ExperimentsRunsTable
        runs={runs}
        workspacePath={workspacePath}
        onOpenResults={onOpenResults}
      />
    </div>
  );
}

function DeleteExperimentDialog({
  open,
  onOpenChange,
  title,
  workspacePath,
  removeLab,
  setRemoveLab,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  workspacePath: string;
  removeLab: boolean;
  setRemoveLab: (v: boolean) => void;
  deleting: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setRemoveLab(false);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("dialogs.experiments.deleteTitle")}</DialogTitle>
        </DialogHeader>
        <p className={SETTINGS_ROW_DESC}>
          {t("experiments.detail.deleteBody", { title })}
        </p>
        <label className="flex items-start gap-2 text-[length:var(--font-size-12)] text-muted-foreground">
          <Checkbox
            checked={removeLab}
            onCheckedChange={(v) => setRemoveLab(v === true)}
            className="mt-0.5"
          />
          <span>{t("experiments.detail.deleteLab", { path: workspacePath })}</span>
        </label>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExperimentsDetail({
  meta,
  tab,
}: {
  meta: ExperimentMeta;
  tab?: RightTab;
}) {
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

  const pane: DetailPane = tab?.experimentsDetailTab ?? "overview";
  const [resultsFocusRunId, setResultsFocusRunId] = useState<string | null>(null);

  const openResultsForRun = useCallback(
    (runId: string) => {
      if (!tab) return;
      setResultsFocusRunId(runId);
      useRightPanelStore
        .getState()
        .updateTab(tab.id, { experimentsDetailTab: "results" });
    },
    [tab],
  );

  const clearResultsFocus = useCallback(() => {
    setResultsFocusRunId(null);
  }, []);

  const deleteDialog = (
    <DeleteExperimentDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title={meta.title}
      workspacePath={meta.workspacePath}
      removeLab={removeLab}
      setRemoveLab={setRemoveLab}
      deleting={deleting}
      onConfirm={() => void handleDelete()}
    />
  );

  if (pane === "run") {
    return (
      <div className="@container flex h-full min-h-0 flex-col font-sans">
        <div className="min-h-0 flex-1 overflow-auto">
          <HistorySection
            runCount={runCount}
            workspacePath={meta.workspacePath}
            runs={runs}
            onOpenResults={tab ? openResultsForRun : undefined}
          />
        </div>
        {deleteDialog}
      </div>
    );
  }

  if (pane === "results") {
    return (
      <div className="@container flex h-full min-h-0 flex-col font-sans">
        <div className="min-h-0 flex-1 overflow-auto">
          <ExperimentsResultsPanel
            workspacePath={meta.workspacePath}
            runs={runs}
            focusRunId={resultsFocusRunId}
            onFocusConsumed={clearResultsFocus}
          />
        </div>
        {deleteDialog}
      </div>
    );
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-auto px-6 py-5 font-sans @md:px-8 @md:py-6">
      <div className="space-y-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className={experimentsDetailTitleClass}>{meta.title}</h2>
              {archived ? (
                <span className={literatureDetailBadgeClass}>
                  {t("experiments.archived")}
                </span>
              ) : null}
            </div>
            <AppMenu>
              <Hint label={t("experiments.moreActions")}>
                <AppMenuTrigger asChild>
                  <Button size="xs" variant="ghost" className="size-6 shrink-0 px-0">
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
          <ExperimentsBriefStrip meta={meta} />
        </header>

        <div className="space-y-8">
          <ExperimentsOverviewPanel
            meta={meta}
            runCount={runCount}
            lastRunAt={lastRunAt ?? lastRun?.finishedAt ?? null}
            lastExitCode={lastRun?.exitCode ?? null}
            onOpenExecution={
              tab
                ? () => {
                    useRightPanelStore
                      .getState()
                      .updateTab(tab.id, { experimentsDetailTab: "run" });
                  }
                : undefined
            }
          />
          <ExperimentsEnvironmentPanel
            env={env}
            reloading={envReloading}
            onRefresh={() => void handleRefreshEnv()}
          />
        </div>

        {deleteDialog}
      </div>
    </div>
  );
}

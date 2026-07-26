/**
 * experiments-toolbar — Mode toolbar for the Experiments RightArea mode.
 *
 * Home: New experiment · Archived view toggle · Refresh
 * Detail: Pane dropdown · (Execution: search + filters + Run dialog) · Open Lab · Refresh
 *
 * Narrow Execution: three filters collapse into a ListFilter popover; action labels hide.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArchiveIcon,
  ChevronDownIcon,
  FolderOpenIcon,
  ListFilterIcon,
  Loader2Icon,
  PenLineIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { Hint } from "@/components/ui/hint";
import { Input } from "@/components/ui/input";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { insertExperimentRunToChat } from "@/lib/chat/insert-to-chat";
import { EXPERIMENT_RUN_KINDS } from "../../../shared/experiment-log";
import {
  experimentsToolbarContextClass,
} from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { ExperimentsCreateDialog } from "./experiments-create-dialog";
import { ExperimentsRunDialog } from "./experiments-run-panel";
import type {
  RunsKindFilter,
  RunsSortOrder,
  RunsStatusFilter,
} from "./experiments-runs-query";

/** Match Git/Literature; Execution has more controls so we collapse earlier. */
const EXPERIMENTS_TOOLBAR_COMPACT_WIDTH = 520;

const toolbarBtn = cn(
  "flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-menu-item)]",
  "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
);

const toolbarIconBtn = cn(toolbarBtn, "size-6 shrink-0 justify-center px-0");

const selectTriggerClass =
  "h-6 shrink-0 text-[length:var(--font-menu-item)]";

type DetailPane = "overview" | "run" | "results";

function RunsFilterSelects({
  status,
  kind,
  sort,
  onStatus,
  onKind,
  onSort,
  stacked = false,
}: {
  status: RunsStatusFilter;
  kind: RunsKindFilter;
  sort: RunsSortOrder;
  onStatus: (v: RunsStatusFilter) => void;
  onKind: (v: RunsKindFilter) => void;
  onSort: (v: RunsSortOrder) => void;
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  const selects = (
    <>
      <AppSelect value={status} onValueChange={(v) => onStatus(v as RunsStatusFilter)}>
        <AppSelectTrigger
          variant="wide"
          aria-label={t("experiments.runs.exitFilterAria")}
          className={cn(selectTriggerClass, stacked && "w-full")}
        >
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="all">{t("experiments.runs.allExits")}</AppSelectItem>
          <AppSelectItem value="success">{t("experiments.runs.success")}</AppSelectItem>
          <AppSelectItem value="failed">{t("experiments.runs.failed")}</AppSelectItem>
          <AppSelectItem value="cancelled">{t("experiments.runs.cancelled")}</AppSelectItem>
        </AppSelectContent>
      </AppSelect>
      <AppSelect value={kind} onValueChange={(v) => onKind(v as RunsKindFilter)}>
        <AppSelectTrigger
          variant="wide"
          aria-label={t("experiments.runs.typeFilterAria")}
          className={cn(selectTriggerClass, stacked && "w-full")}
        >
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="all">{t("experiments.runs.allTypes")}</AppSelectItem>
          {EXPERIMENT_RUN_KINDS.map((k) => (
            <AppSelectItem key={k} value={k}>
              {k}
            </AppSelectItem>
          ))}
          <AppSelectItem value="untagged">{t("experiments.untyped")}</AppSelectItem>
        </AppSelectContent>
      </AppSelect>
      <AppSelect value={sort} onValueChange={(v) => onSort(v as RunsSortOrder)}>
        <AppSelectTrigger
          variant="wide"
          aria-label={t("experiments.runs.sortAria")}
          className={cn(selectTriggerClass, stacked && "w-full")}
        >
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="newest">{t("experiments.runs.newestFirst")}</AppSelectItem>
          <AppSelectItem value="oldest">{t("experiments.runs.oldestFirst")}</AppSelectItem>
        </AppSelectContent>
      </AppSelect>
    </>
  );

  if (!stacked) return selects;

  return <div className="flex w-[14rem] flex-col gap-2 p-1">{selects}</div>;
}

export function ExperimentsToolbar({ tab }: { tab: RightTab }) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const refreshList = useExperimentStore((s) => s.refreshList);
  const loadResultsSnapshot = useExperimentStore((s) => s.loadResultsSnapshot);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);
  const setShowArchived = useExperimentStore((s) => s.setShowArchived);
  const showArchived = useExperimentStore((s) => s.showArchived);
  const loading = useExperimentStore((s) => s.loading);
  const openLabInFiles = useExperimentStore((s) => s.openLabInFiles);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const experimentCount = useExperimentStore((s) => s.experiments.length);
  const runsQuery = useExperimentStore((s) => s.runsQuery);
  const setRunsQuery = useExperimentStore((s) => s.setRunsQuery);
  const checkedRunIds = useExperimentStore((s) => s.checkedRunIds);
  const clearCheckedRuns = useExperimentStore((s) => s.clearCheckedRuns);
  const detailRuns = useExperimentStore((s) => s.detail?.runs);
  const runInFlight = useExperimentStore((s) => s.runInFlight);
  const cancelRun = useExperimentStore((s) => s.cancelRun);
  const inDetail = Boolean(tab.experimentId ?? selectedId);
  const activeDetailTab: DetailPane = tab.experimentsDetailTab ?? "overview";
  const showRunFilters = inDetail && activeDetailTab === "run";
  const experimentId = selectedId ?? tab.experimentId ?? null;
  const isInFlightForCurrent = Boolean(
    runInFlight && experimentId && runInFlight.id === experimentId,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const apply = () => setCompact(el.clientWidth < EXPERIMENTS_TOOLBAR_COMPACT_WIDTH);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtersActive =
    runsQuery.status !== "all" || runsQuery.kind !== "all" || runsQuery.sort !== "newest";

  const setDetailPane = useCallback(
    (pane: DetailPane) => {
      useRightPanelStore.getState().updateTab(tab.id, { experimentsDetailTab: pane });
      setPaneMenuOpen(false);
    },
    [tab.id],
  );

  const paneLabel =
    activeDetailTab === "overview"
      ? t("experiments.overview.label")
      : activeDetailTab === "run"
        ? t("experiments.execution")
        : t("experiments.results.tab");

  const handleRefresh = useCallback(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
    const currentId = selectedId ?? tab.experimentId;
    if (inDetail && currentId) {
      void selectExperiment(projectRoot, currentId);
      void loadResultsSnapshot(projectRoot, currentId);
    }
  }, [inDetail, loadResultsSnapshot, projectRoot, refreshList, selectExperiment, selectedId, tab.experimentId]);

  const handleToggleArchived = useCallback(() => {
    if (!projectRoot) return;
    void setShowArchived(projectRoot, !showArchived);
  }, [projectRoot, setShowArchived, showArchived]);

  const handleOpenLab = useCallback(async () => {
    const id = selectedId ?? tab.experimentId;
    if (!projectRoot || !id) return;
    const paths = await openLabInFiles(projectRoot, id);
    if (!paths) {
      toast.error(t("experiments.toolbar.resolveFailed"));
    }
  }, [projectRoot, selectedId, tab.experimentId, openLabInFiles, t]);

  const handleCancelRun = useCallback(() => {
    if (!projectRoot || !experimentId || !runInFlight || runInFlight.id !== experimentId) {
      return;
    }
    void cancelRun(projectRoot, experimentId, runInFlight.runId);
  }, [cancelRun, experimentId, projectRoot, runInFlight]);

  const handleCiteChecked = useCallback(() => {
    if (!detailRuns || checkedRunIds.length === 0) return;
    const workspacePath = useExperimentStore.getState().detail?.meta.workspacePath;
    const picked = detailRuns.filter((r) => checkedRunIds.includes(r.runId));
    let okCount = 0;
    for (const run of picked) {
      const ok = insertExperimentRunToChat({
        runId: run.runId,
        experimentId: experimentId ?? undefined,
        command: run.command,
        exitCode: run.exitCode,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        artifacts: run.artifacts ?? [],
        artifactSnapshots: run.artifactSnapshots,
        env: run.env,
        chatSessionId: run.chatSessionId ?? null,
        workspacePath,
        runKind: run.kind,
        notes: run.notes,
        logPath: run.logPath ?? null,
        intent: "cite-in-paper",
        quiet: true,
      });
      if (ok) okCount += 1;
    }
    if (okCount > 0) {
      toast.success(
        okCount === 1
          ? t("experiments.runs.citeAddedOne")
          : t("experiments.runs.citeAddedMany", { count: okCount }),
      );
      clearCheckedRuns();
    }
  }, [checkedRunIds, clearCheckedRuns, detailRuns, experimentId, t]);

  const contextLabel = showArchived
    ? experimentCount > 0
      ? t("experiments.toolbar.archivedCount", { count: experimentCount })
      : t("experiments.toolbar.noArchived")
    : experimentCount > 0
      ? t("experiments.toolbar.experimentCount", { count: experimentCount })
      : t("experiments.title");

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "flex flex-1 items-center min-h-8 min-w-0 overflow-hidden",
        compact ? "gap-0.5" : "gap-1",
      )}
    >
      {inDetail ? (
        <AppMenu open={paneMenuOpen} onOpenChange={setPaneMenuOpen}>
          <AppMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                toolbarBtn,
                "shrink-0 gap-1 font-medium text-foreground",
                !showRunFilters && "mr-auto",
              )}
              aria-label={t("experiments.toolbar.paneMenuAria")}
            >
              <span className="truncate">{paneLabel}</span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" aria-hidden />
            </button>
          </AppMenuTrigger>
          <AppMenuContent align="start" className="min-w-[9rem]">
            <AppMenuCheckItem
              selected={activeDetailTab === "overview"}
              onClick={() => setDetailPane("overview")}
            >
              {t("experiments.overview.label")}
            </AppMenuCheckItem>
            <AppMenuCheckItem
              selected={activeDetailTab === "run"}
              onClick={() => setDetailPane("run")}
            >
              {t("experiments.execution")}
            </AppMenuCheckItem>
            <AppMenuCheckItem
              selected={activeDetailTab === "results"}
              onClick={() => setDetailPane("results")}
            >
              {t("experiments.results.tab")}
            </AppMenuCheckItem>
          </AppMenuContent>
        </AppMenu>
      ) : (
        <span className={cn("mr-auto truncate", experimentsToolbarContextClass)}>
          {contextLabel}
        </span>
      )}

      {showRunFilters ? (
        <>
          {compact ? (
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    toolbarIconBtn,
                    "relative",
                    filtersActive && "text-foreground",
                  )}
                  aria-label={t("experiments.runs.filtersMenuAria")}
                  title={t("experiments.runs.filtersMenu")}
                >
                  <ListFilterIcon className="size-3.5" />
                  {filtersActive ? (
                    <span
                      className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary ring-1 ring-background"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <RunsFilterSelects
                  stacked
                  status={runsQuery.status}
                  kind={runsQuery.kind}
                  sort={runsQuery.sort}
                  onStatus={(status) => setRunsQuery({ status })}
                  onKind={(kind) => setRunsQuery({ kind })}
                  onSort={(sort) => setRunsQuery({ sort })}
                />
              </PopoverContent>
            </Popover>
          ) : (
            <RunsFilterSelects
              status={runsQuery.status}
              kind={runsQuery.kind}
              sort={runsQuery.sort}
              onStatus={(status) => setRunsQuery({ status })}
              onKind={(kind) => setRunsQuery({ kind })}
              onSort={(sort) => setRunsQuery({ sort })}
            />
          )}
          <Input
            value={runsQuery.text}
            onChange={(e) => setRunsQuery({ text: e.target.value })}
            placeholder={
              compact
                ? t("experiments.runs.filterPlaceholderShort")
                : t("experiments.runs.filterPlaceholder")
            }
            className={cn(
              "mr-auto h-6 min-w-0 flex-1 px-2 text-[length:var(--font-menu-item)]",
              "md:text-[length:var(--font-menu-item)] placeholder:text-[length:var(--font-menu-item)]",
              compact ? "max-w-[9rem]" : "max-w-[12rem]",
            )}
            aria-label={t("experiments.runs.filterAria")}
          />
          {checkedRunIds.length > 0 ? (
            <Hint label={t("experiments.runs.sendToChat")}>
              <button
                type="button"
                className={cn(compact ? toolbarIconBtn : toolbarBtn, "shrink-0")}
                onClick={handleCiteChecked}
              >
                <PenLineIcon className="size-3.5" />
                {!compact ? (
                  <span>
                    {t("experiments.runs.useInPaper")}
                    {checkedRunIds.length > 1 ? ` (${checkedRunIds.length})` : ""}
                  </span>
                ) : null}
              </button>
            </Hint>
          ) : null}
          {isInFlightForCurrent ? (
            <Hint label={t("experiments.runPanel.cancelRun")}>
              <button
                type="button"
                className={cn(compact ? toolbarIconBtn : toolbarBtn, "shrink-0")}
                onClick={handleCancelRun}
              >
                <SquareIcon className="size-3.5" />
                {!compact ? <span>{t("experiments.cancel")}</span> : null}
              </button>
            </Hint>
          ) : (
            <Hint label={t("experiments.runPanel.runInLab")}>
              <button
                type="button"
                className={cn(compact ? toolbarIconBtn : toolbarBtn, "shrink-0")}
                disabled={!projectRoot || !experimentId}
                onClick={() => setRunDialogOpen(true)}
              >
                <PlayIcon className="size-3.5" />
                {!compact ? <span>{t("experiments.run")}</span> : null}
              </button>
            </Hint>
          )}
        </>
      ) : null}

      {inDetail ? (
        <Hint label={t("experiments.openLab")}>
          <button
            type="button"
            className={cn(compact ? toolbarIconBtn : toolbarBtn, "shrink-0")}
            onClick={() => void handleOpenLab()}
          >
            <FolderOpenIcon className="size-3.5" />
            {!compact ? (
              <span className="hidden @sm:inline">{t("experiments.openLab")}</span>
            ) : null}
          </button>
        </Hint>
      ) : null}

      {!inDetail ? (
        <Hint label={t("experiments.create.new")}>
          <button
            type="button"
            className={cn(toolbarBtn, "shrink-0")}
            disabled={!projectRoot || loading || showArchived}
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="size-3.5" />
            <span>{t("experiments.create.new")}</span>
          </button>
        </Hint>
      ) : null}

      {!inDetail ? (
        <Hint
          label={
            showArchived
              ? t("experiments.toolbar.showActive")
              : t("experiments.toolbar.showArchivedOnly")
          }
        >
          <button
            type="button"
            className={cn(
              toolbarBtn,
              "shrink-0",
              showArchived && "bg-accent text-foreground font-medium",
            )}
            onClick={handleToggleArchived}
          >
            <ArchiveIcon className="size-3.5" />
            <span>
              {showArchived
                ? t("experiments.toolbar.viewingArchived")
                : t("experiments.archived")}
            </span>
          </button>
        </Hint>
      ) : null}

      <Hint label={t("experiments.toolbar.refreshTitle")}>
        <button
          type="button"
          className={cn(toolbarIconBtn)}
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
        </button>
      </Hint>

      <ExperimentsCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ExperimentsRunDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} />
    </div>
  );
}

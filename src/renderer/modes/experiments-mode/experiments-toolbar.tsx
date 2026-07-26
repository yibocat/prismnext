/**
 * experiments-toolbar — Mode toolbar for the Experiments RightArea mode.
 *
 * Home: New experiment · Archived view toggle · Refresh
 * Detail: Back · working-dir path · Open working directory · Refresh
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  FolderOpenIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useExperimentStore } from "@/stores/experiment-store";
import { Button } from "@/components/ui/button";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import {
  experimentsPathCompactClass,
  experimentsToolbarContextClass,
} from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { ExperimentsCreateDialog } from "./experiments-create-dialog";

const toolbarBtn = cn(
  "flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-menu-item)]",
  "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
);

export function ExperimentsToolbar({ tab }: { tab: RightTab }) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const refreshList = useExperimentStore((s) => s.refreshList);
  const setShowArchived = useExperimentStore((s) => s.setShowArchived);
  const showArchived = useExperimentStore((s) => s.showArchived);
  const loading = useExperimentStore((s) => s.loading);
  const openLabInFiles = useExperimentStore((s) => s.openLabInFiles);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const clearSelection = useExperimentStore((s) => s.clearSelection);
  const experimentCount = useExperimentStore((s) => s.experiments.length);
  const workspacePath = useExperimentStore((s) => s.detail?.meta.workspacePath);
  const inDetail = Boolean(tab.experimentId ?? selectedId);
  const [createOpen, setCreateOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
  }, [projectRoot, refreshList]);

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

  const contextLabel = showArchived
    ? experimentCount > 0
      ? t("experiments.toolbar.archivedCount", { count: experimentCount })
      : t("experiments.toolbar.noArchived")
    : experimentCount > 0
      ? t("experiments.toolbar.experimentCount", { count: experimentCount })
      : t("experiments.title");

  return (
    <div className="flex flex-1 items-center min-h-8 min-w-0 overflow-hidden gap-1">
      {inDetail ? (
        <Hint label={t("experiments.toolbar.back")}>
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={clearSelection}
          >
            <ArrowLeftIcon className="size-3.5" aria-hidden />
          </button>
        </Hint>
      ) : null}
      {inDetail && workspacePath ? (
        <span
          className={cn(
            "mr-auto inline-flex min-w-0 items-center gap-1 truncate",
            experimentsToolbarContextClass,
          )}
          title={workspacePath}
        >
          <FolderOpenIcon className="size-3 shrink-0 text-muted-foreground/80" aria-hidden />
          <span className={experimentsPathCompactClass}>{workspacePath}</span>
        </span>
      ) : (
        <span className={cn("mr-auto truncate", experimentsToolbarContextClass)}>
          {contextLabel}
        </span>
      )}
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
              showArchived && "bg-accent text-foreground",
            )}
            disabled={!projectRoot || loading}
            aria-pressed={showArchived}
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
          className={cn(toolbarBtn, "shrink-0")}
          disabled={!projectRoot || loading}
          onClick={handleRefresh}
        >
          {loading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
          <span>{t("experiments.refresh")}</span>
        </button>
      </Hint>

      <Hint label={t("experiments.toolbar.openLabTitle")}>
        <Button
          size="xs"
          variant="ghost"
          className="h-6 shrink-0 px-2 text-muted-foreground hover:text-foreground"
          disabled={!projectRoot || !inDetail || !(selectedId ?? tab.experimentId)}
          onClick={() => void handleOpenLab()}
        >
          <FolderOpenIcon className="size-3.5" />
          <span className="ml-1">{t("experiments.openLab")}</span>
        </Button>
      </Hint>

      <ExperimentsCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

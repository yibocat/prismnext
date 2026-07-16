/**
 * experiments-toolbar — Mode toolbar for the Experiments RightArea mode
 * (Sprint 0.7).
 *
 * Per the product spec, P0 toolbar = Refresh + Open lab. New experiment,
 * run / cancel, and other actions land in Tasks 5–7.
 *
 * Mirrors the literature-mode `LiteratureToolbar` shape (receives `tab`,
 * pulls the rest from stores via hooks).
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  FolderOpenIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useExperimentStore } from "@/stores/experiment-store";
import { Button } from "@/components/ui/button";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { cn } from "@/lib/utils";
import { experimentsPathCompactClass, experimentsToolbarContextClass } from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";

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

  const handleRefresh = useCallback(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
  }, [projectRoot, refreshList]);

  const handleToggleArchived = useCallback(() => {
    if (!projectRoot) return;
    void setShowArchived(projectRoot, !showArchived);
  }, [projectRoot, setShowArchived, showArchived]);

  const handleOpenLab = useCallback(async () => {
    // Prefer the tab's experimentId (Task 5 wires it on selection); fall back
    // to the store's selectedId so the button works in Task 4 already.
    const id = selectedId ?? tab.experimentId;
    if (!projectRoot || !id) return;
    const paths = await openLabInFiles(projectRoot, id);
    if (!paths) {
      toast.error(t("experiments.toolbar.resolveFailed"));
    }
    // Task 7 will additionally call navigateFileTreeToPath(paths.workspaceRel)
    // from a component layer hook. The store-level action is intentionally
    // minimal: it switches to Files mode and returns the paths.
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
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t("experiments.toolbar.back")}
          onClick={clearSelection}
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
        </button>
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
        <button
          type="button"
          className={cn(
            toolbarBtn,
            "shrink-0",
            showArchived && "bg-accent/60 text-foreground",
          )}
          title={
            showArchived
              ? t("experiments.toolbar.showActive")
              : t("experiments.toolbar.showArchivedOnly")
          }
          disabled={!projectRoot || loading}
          aria-pressed={showArchived}
          onClick={handleToggleArchived}
        >
          <ArchiveIcon className="size-3.5" />
          <span>{t("experiments.archived")}</span>
        </button>
      ) : null}
      <button
        type="button"
        className={cn(toolbarBtn, "shrink-0")}
        title={t("experiments.toolbar.refreshTitle")}
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

      <Button
        size="xs"
        variant="ghost"
        className="h-6 shrink-0 px-2 text-muted-foreground hover:text-foreground"
        title={t("experiments.toolbar.openLabTitle")}
        disabled={!projectRoot || !inDetail || !(selectedId ?? tab.experimentId)}
        onClick={() => void handleOpenLab()}
      >
        <FolderOpenIcon className="size-3.5" />
        <span className="ml-1">{t("experiments.openLab")}</span>
      </Button>
    </div>
  );
}

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
import { ArrowLeftIcon, FolderOpenIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { Button } from "@/components/ui/button";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { cn } from "@/lib/utils";
import { experimentsPathCompactClass, experimentsToolbarContextClass } from "./experiments-detail-chrome";

const toolbarBtn = cn(
  "flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-menu-item)]",
  "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
);

export function ExperimentsToolbar({ tab }: { tab: RightTab }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const refreshList = useExperimentStore((s) => s.refreshList);
  const loading = useExperimentStore((s) => s.loading);
  const openLabInFiles = useExperimentStore((s) => s.openLabInFiles);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const clearSelection = useExperimentStore((s) => s.clearSelection);
  const experimentCount = useExperimentStore((s) => s.experiments.length);
  const workspacePath = useExperimentStore((s) => s.detail?.meta.workspacePath);
  const inDetail = Boolean(selectedId);

  const handleRefresh = useCallback(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
  }, [projectRoot, refreshList]);

  const handleOpenLab = useCallback(async () => {
    // Prefer the tab's experimentId (Task 5 wires it on selection); fall back
    // to the store's selectedId so the button works in Task 4 already.
    const id = selectedId ?? tab.experimentId;
    if (!projectRoot || !id) return;
    const paths = await openLabInFiles(projectRoot, id);
    if (!paths) {
      toast.error("Could not resolve experiment paths.");
    }
    // Task 7 will additionally call navigateFileTreeToPath(paths.workspaceRel)
    // from a component layer hook. The store-level action is intentionally
    // minimal: it switches to Files mode and returns the paths.
  }, [projectRoot, selectedId, tab.experimentId, openLabInFiles]);

  return (
    <div className="flex flex-1 items-center min-h-8 min-w-0 overflow-hidden gap-1">
      {inDetail ? (
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Back to experiments"
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
          {experimentCount > 0 ? `${experimentCount} experiments` : "Experiments"}
        </span>
      )}
      <button
        type="button"
        className={cn(toolbarBtn, "shrink-0")}
        title="Refresh experiment list"
        disabled={!projectRoot || loading}
        onClick={handleRefresh}
      >
        {loading ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
        <span>Refresh</span>
      </button>

      <Button
        size="xs"
        variant="ghost"
        className="h-6 shrink-0 px-2 text-muted-foreground hover:text-foreground"
        title="Open the experiment's lab folder in Files"
        disabled={!projectRoot || !inDetail || !(selectedId ?? tab.experimentId)}
        onClick={() => void handleOpenLab()}
      >
        <FolderOpenIcon className="size-3.5" />
        <span className="ml-1">Open lab</span>
      </Button>
    </div>
  );
}

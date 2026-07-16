/**
 * experiments-empty — Empty-state surfaces for the Experiments RightArea
 * mode (Sprint 0.7). Two workspace-scoped cases per the product spec:
 *   1. No Experiment folder configured (button → Settings Workspace).
 *   2. Empty list (folder configured but no experiments).
 * Plus a load-error surface so IPC failures are not mistaken for an empty
 * registry.
 *
 * The "no project" case is rendered inline by `ExperimentsContent` (mirrors
 * the literature-mode "Open a project first." pattern) and is not in this
 * file.
 */

import { useLayoutStore } from "@/stores/layout-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { Button } from "@/components/ui/button";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  FlaskConicalIcon,
  FolderPlusIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EXPERIMENT_REGISTRY_REL } from "../../../shared/experiment-log";

/**
 * No experiment folder configured. Offer a button that opens the Settings
 * editor for a new workspace folder (Settings → Workspace → Add folder →
 * function: experiment). Task 5+ can replace this with a richer link.
 */
export function ExperimentsNoFolderEmpty() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <FlaskConicalIcon className="size-8 text-muted-foreground/60" />
        <p className="text-[length:var(--font-size-13)] text-foreground">
          No Experiment folder configured.
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          Add one in Settings → Workspace. The folder holds your experiment
          registry (meta + runs) and the lab workspace you work in.
        </p>
        <OpenWorkspaceSettingsButton />
      </div>
    </div>
  );
}

/**
 * Folder is configured but the registry is empty. P0 copy only — no
 * composer pre-fill (P1). No "Focus chat" button - an earlier version
 * deactivated the Experiments mode on click (looked like the panel broke).
 */
export function ExperimentsEmptyListEmpty({ archivedOnly = false }: { archivedOnly?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 font-sans">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <FlaskConicalIcon className="size-8 text-muted-foreground/60" />
        <p className="text-[length:var(--font-size-13)] text-foreground">
          {archivedOnly ? "No archived experiments." : "No experiments yet."}
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {archivedOnly
            ? "Archive an experiment from its detail menu (⋯ → Archive)."
            : "Ask the Agent in chat to create one. The Agent reads your research brief, scaffolds a registry entry, and links the lab folder."}
        </p>
      </div>
    </div>
  );
}

/**
 * Soft banner when some registry dirs have missing/corrupt meta.json (Bug #19).
 * Does not replace the list — healthy experiments still show.
 */
export function ExperimentsCorruptMetaBanner({
  corruptIds,
  className,
}: {
  corruptIds: string[];
  className?: string;
}) {
  if (corruptIds.length === 0) return null;
  const shown = corruptIds.slice(0, 4);
  const more = corruptIds.length - shown.length;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2",
        "text-[length:var(--font-size-12)] text-foreground/85",
        className,
      )}
    >
      <AlertTriangleIcon
        className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-400"
        aria-hidden
      />
      <div className="min-w-0 space-y-0.5">
        <p>
          {corruptIds.length === 1
            ? "1 experiment has corrupt or missing metadata and was skipped."
            : `${corruptIds.length} experiments have corrupt or missing metadata and were skipped.`}
        </p>
        <p className="truncate text-muted-foreground">
          {shown.join(", ")}
          {more > 0 ? ` (+${more} more)` : ""}
          {" · "}
          check <span className="font-mono">{EXPERIMENT_REGISTRY_REL}/&lt;id&gt;/meta.json</span>
        </p>
      </div>
    </div>
  );
}

/** List / detail IPC failed — not the same as an empty registry. */
export function ExperimentsLoadError({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <AlertCircleIcon className="size-8 text-muted-foreground/60" />
        <p className="text-[length:var(--font-size-13)] text-foreground">
          Could not load experiments.
        </p>
        <p className="break-words text-[length:var(--font-size-12)] text-muted-foreground">
          {error}
        </p>
        {onRetry ? (
          <Button size="sm" variant="secondary" className="mt-1" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OpenWorkspaceSettingsButton() {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="mt-1"
      onClick={() => {
        const st = useLayoutStore.getState();
        // Surface the workspace category in the Settings left list, then
        // open the new-folder editor. The user picks the directory and
        // sets the function to "experiment" before saving.
        st.setSettingsCategory("workspace");
        st.setLeftSidebarView("settings");
        openSettingsPanel({ kind: "workspace-folder", scope: "project", mode: "new" });
      }}
    >
      <FolderPlusIcon className="size-3.5" />
      Add folder in Settings
    </Button>
  );
}

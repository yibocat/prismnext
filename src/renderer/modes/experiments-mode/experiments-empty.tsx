/**
 * experiments-empty — Empty-state surfaces for the Experiments RightArea
 * mode (Sprint 0.7). Two workspace-scoped cases per the product spec:
 *   1. No Experiments workspace root configured (button → Settings Workspace).
 *   2. Empty list (root configured but no experiments).
 * Plus a load-error surface so IPC failures are not mistaken for an empty
 * experiment list.
 *
 * The "no project" case is rendered inline by `ExperimentsContent` (mirrors
 * the literature-mode "Open a project first." pattern) and is not in this
 * file.
 */

import { useTranslation } from "react-i18next";
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
import { EXPERIMENT_REGISTRY_REL } from "../../../shared/experiments/log";
import { ExperimentsNewButton } from "./experiments-new-button";

/**
 * No experiment folder configured. Offer a button that opens the Settings
 * editor for a new workspace folder (Settings → Workspace → Add folder →
 * function: experiment). Task 5+ can replace this with a richer link.
 */
export function ExperimentsNoFolderEmpty() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <FlaskConicalIcon className="size-8 text-muted-foreground/60" />
        <p className="text-[length:var(--font-size-13)] text-foreground">
          {t("experiments.empty.noFolderTitle")}
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("experiments.empty.noFolderDesc")}
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
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 font-sans">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <FlaskConicalIcon className="size-8 text-muted-foreground/60" />
        <p className="text-[length:var(--font-size-13)] text-foreground">
          {archivedOnly
            ? t("experiments.empty.noArchived")
            : t("experiments.empty.noExperiments")}
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {archivedOnly
            ? t("experiments.empty.noArchivedDesc")
            : t("experiments.empty.noExperimentsDesc")}
        </p>
        {!archivedOnly ? <ExperimentsNewButton className="mt-1" /> : null}
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
  const { t } = useTranslation();
  if (corruptIds.length === 0) return null;
  const shown = corruptIds.slice(0, 4);
  const more = corruptIds.length - shown.length;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 border-b border-warning bg-muted px-3 py-2",
        "text-[length:var(--font-size-12)] text-foreground",
        className,
      )}
    >
      <AlertTriangleIcon
        className="mt-0.5 size-3.5 shrink-0 text-warning"
        aria-hidden
      />
      <div className="min-w-0 space-y-0.5">
        <p>
          {corruptIds.length === 1
            ? t("experiments.empty.corruptOne")
            : t("experiments.empty.corruptMany", { count: corruptIds.length })}
        </p>
        <p className="truncate text-muted-foreground">
          {shown.join(", ")}
          {more > 0 ? ` ${t("experiments.empty.moreCount", { count: more })}` : ""}
          {" · "}
          {t("experiments.empty.checkMeta", { path: EXPERIMENT_REGISTRY_REL })}
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
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <AlertCircleIcon className="size-8 text-muted-foreground/60" />
        <p className="text-[length:var(--font-size-13)] text-foreground">
          {t("experiments.empty.loadError")}
        </p>
        <p className="break-words text-[length:var(--font-size-12)] text-muted-foreground">
          {error}
        </p>
        {onRetry ? (
          <Button size="sm" variant="secondary" className="mt-1" onClick={onRetry}>
            {t("experiments.retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OpenWorkspaceSettingsButton() {
  const { t } = useTranslation();
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
        openSettingsPanel({ kind: "workspace-folder", mode: "new" });
      }}
    >
      <FolderPlusIcon className="size-3.5" />
      {t("experiments.empty.addFolder")}
    </Button>
  );
}

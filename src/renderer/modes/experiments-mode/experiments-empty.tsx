/**
 * experiments-empty — Empty-state surfaces for the Experiments RightArea
 * mode (Sprint 0.7). Two workspace-scoped cases per the product spec:
 *   1. No Experiment folder configured (button → Settings Workspace).
 *   2. Empty list (folder configured but no experiments).
 *
 * The "no project" case is rendered inline by `ExperimentsContent` (mirrors
 * the literature-mode "Open a project first." pattern) and is not in this
 * file.
 */

import { useLayoutStore } from "@/stores/layout-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { Button } from "@/components/ui/button";
import { FlaskConicalIcon, FolderPlusIcon, MessageSquareIcon } from "lucide-react";

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
 * composer pre-fill (P1). The "Focus chat" button just brings the chat
 * panel into view; we deliberately do not push a prompt.
 */
export function ExperimentsEmptyListEmpty() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <FlaskConicalIcon className="size-8 text-muted-foreground/60" />
        <p className="text-[length:var(--font-size-13)] text-foreground">
          No experiments yet.
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          Ask the Agent in chat to create one. The Agent reads your research
          brief, scaffolds a registry entry, and links the lab folder.
        </p>
        <FocusChatButton />
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

function FocusChatButton() {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="mt-1"
      onClick={() => {
        const st = useLayoutStore.getState();
        // Collapse the RightArea and restore the chat-centered view. The
        // composer is not pre-filled (P1).
        st.deactivateMode("experiments");
        st.setLeftSidebarView("sessions");
      }}
    >
      <MessageSquareIcon className="size-3.5" />
      Focus chat
    </Button>
  );
}

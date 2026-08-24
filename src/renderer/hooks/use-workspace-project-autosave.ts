import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import {
  createWorkspaceFolders,
  ensureWorkspaceMainTex,
  useWorkspaceConfigStore,
} from "@/stores/workspace-config-store";
import { toast } from "sonner";

export type WorkspaceSaveStatus = "idle" | "saving" | "saved" | "error";

/** Debounced persist for live project workspace dirs. */
export function useWorkspaceProjectAutosave(projectRoot: string | null, loaded: boolean) {
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const saveConfig = useWorkspaceConfigStore((s) => s.saveConfig);
  const [status, setStatus] = useState<WorkspaceSaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !projectRoot) return;
    const capturedRoot = projectRoot;
    // Snapshot the dirs that triggered this save. The cleanup flush below MUST
    // use this snapshot, NOT the live store - otherwise a reset() during project
    // switch would read `[]` from the store and overwrite the old project's
    // settings.json with an empty array, permanently losing all folders.
    const capturedDirs = useWorkspaceConfigStore.getState().workspaceDirs;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus("saving");

    debounceRef.current = setTimeout(async () => {
      // Clear the pending flag FIRST so cleanup no longer thinks there is an
      // unsaved change to flush (this timer is handling it).
      debounceRef.current = null;
      const dirs = useWorkspaceConfigStore.getState().workspaceDirs;
      const ok = await saveConfig(capturedRoot);
      if (ok) {
        const createResult = await createWorkspaceFolders(capturedRoot, dirs);
        const manuscript = dirs.find((d) => d.function === "manuscript");
        if (manuscript && createResult.created.includes(manuscript.name)) {
          const mainTexResult = await ensureWorkspaceMainTex(capturedRoot);
          if (mainTexResult.created) {
            toast.success(`Created ${mainTexResult.relativePath}`, { duration: 2000 });
          }
        }
        const docStore = useDocumentStore.getState();
        if (docStore.reloadMetadataFromDisk) {
          await docStore.reloadMetadataFromDisk(true);
        }
        setStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
      } else {
        const errMsg =
          useWorkspaceConfigStore.getState().error ||
          "Failed to save workspace configuration.";
        toast.error(errMsg);
        setStatus("error");
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        // Flush the snapshot captured when this change was scheduled. Never read
        // the live store here - a project-switch reset() may have already emptied
        // it. Also guard against flushing an empty snapshot: an empty dirs array
        // is the data-loss signature, and the server-side guard rejects it too.
        if (capturedRoot && capturedDirs.length > 0) {
          saveConfig(capturedRoot).catch(() => {});
        }
      }
    };
  }, [workspaceDirs, loaded, projectRoot, saveConfig]);

  return status;
}

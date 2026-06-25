import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
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

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus("saving");

    debounceRef.current = setTimeout(async () => {
      const dirs = useWorkspaceConfigStore.getState().workspaceDirs;
      const ok = await saveConfig(capturedRoot);
      if (ok) {
        const createResult = await window.electronAPI.workspaceCreateFolders(capturedRoot, dirs);
        const manuscript = dirs.find((d) => d.function === "manuscript");
        if (manuscript && createResult.created.includes(manuscript.name)) {
          const mainTexResult = await window.electronAPI.workspaceEnsureMainTex(capturedRoot);
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
        if (capturedRoot) saveConfig(capturedRoot).catch(() => {});
      }
    };
  }, [workspaceDirs, loaded, projectRoot, saveConfig]);

  return status;
}

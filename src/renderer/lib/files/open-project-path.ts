import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { resolveProjectRelativePath } from "./project-path";

/** Open a hidden `.prismnext/` file in the editor (tab + content load). */
export async function openHiddenProjectFile(
  relativePath: string,
  opts?: { pin?: boolean },
): Promise<void> {
  const store = useDocumentStore.getState();
  if (!store.projectRoot) return;

  const abs = resolveProjectRelativePath(store.projectRoot, relativePath);
  if (!abs) return;

  const registered = await store.ensureLazyProjectFileMeta(relativePath);
  if (!registered) return;

  const name = relativePath.split("/").pop() || relativePath;
  useRightPanelStore.getState().openFile(relativePath, relativePath, name, {
    pin: opts?.pin ?? true,
  });
  await store.openFile(relativePath);
}

/** Reveal a hidden `.prismnext/` path in the system file manager. */
export function revealProjectHiddenPath(relativePath: string): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;

  const abs = resolveProjectRelativePath(projectRoot, relativePath);
  if (!abs) return;

  void window.electronAPI.shellShowItemInFolder(abs);
}

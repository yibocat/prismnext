import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { resolveProjectRelativePath } from "./project-path";
import { revealProjectRelativePath } from "./reveal-project-path";

/** Open a hidden project file (`.prismnext/…` or `.brief.md`) in the editor (tab + content load). */
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
  revealProjectRelativePath(relativePath);
}

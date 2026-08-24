import { shellDesktop } from "@/lib/desktop-api/shell";
import { useDocumentStore } from "@/stores/document-store";
import { resolveProjectRelativePath } from "./project-path";

/** Reveal a project-relative file or folder in the system file manager. */
export function revealProjectRelativePath(relativePath: string): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;

  const abs = resolveProjectRelativePath(projectRoot, relativePath);
  if (!abs) return;

  void shellDesktop.shellShowItemInFolder(abs);
}

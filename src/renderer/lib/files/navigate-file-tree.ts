import { useLayoutStore } from "@/stores/layout-store";

/** Reveal a project-relative path in the Files sidebar tree. */
export function navigateFileTreeToPath(path: string): void {
  useLayoutStore.getState().setFileTreeNavigatePath(path);
}

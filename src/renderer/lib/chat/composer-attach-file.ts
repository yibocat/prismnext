import type { ProjectFile } from "@/stores/document-store";
import { useDocumentStore } from "@/stores/document-store";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

/** Pick file(s) via dialog and register project/external entries for @mention. */
export async function pickComposerAttachments(opts?: {
  imagesOnly?: boolean;
}): Promise<ProjectFile[]> {
  const result = await window.electronAPI.dialogOpenFile();
  if (result.canceled || result.paths.length === 0) return [];

  const store = useDocumentStore.getState();
  const attached: ProjectFile[] = [];

  for (const absPath of result.paths) {
    if (opts?.imagesOnly && !isImagePath(absPath)) continue;

    const inProject = store.files.find((f) => f.absolutePath === absPath);
    if (inProject) {
      attached.push(inProject);
      continue;
    }

    attached.push(store.registerExternalFile(absPath));
  }

  return attached;
}

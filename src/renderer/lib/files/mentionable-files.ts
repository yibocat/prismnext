import type { ProjectFile } from "@/stores/document-store";
import { isExternalFileId } from "./external-file";

/** Project files plus any open external files for @mention picker. */
export function getMentionableFiles(
  projectFiles: ProjectFile[],
  fileMetadata: Map<string, {
    relativePath: string;
    absolutePath: string;
    name: string;
    type: ProjectFile["type"];
    isExternal?: boolean;
  }>,
): ProjectFile[] {
  const ids = new Set(projectFiles.map((f) => f.id));
  const external: ProjectFile[] = [];

  for (const [id, meta] of fileMetadata) {
    if (!meta.isExternal || ids.has(id)) continue;
    external.push({
      id,
      name: meta.name,
      relativePath: meta.absolutePath,
      absolutePath: meta.absolutePath,
      type: meta.type,
    });
  }

  return [...projectFiles, ...external];
}

export function mentionFileLabel(file: ProjectFile): string {
  return isExternalFileId(file.id) ? file.absolutePath : file.relativePath;
}

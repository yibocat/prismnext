import {
  markProjectRemoved,
  mergeProjectDirectory,
  parseProjectDirectoryIndex,
  type ProjectDirectoryEntry,
  type ProjectDirectoryIndex,
} from "../../shared/workbench/project-directory-index";
import {
  readWorkbenchHomeSettings,
  writeWorkbenchHomeSettings,
  type WorkbenchHomeOpts,
} from "./home";

export function readProjectDirectory(opts?: WorkbenchHomeOpts): ProjectDirectoryIndex {
  return parseProjectDirectoryIndex(readWorkbenchHomeSettings(opts).projectDirectoryById);
}

function writeProjectDirectory(index: ProjectDirectoryIndex, opts?: WorkbenchHomeOpts): void {
  const current = readWorkbenchHomeSettings(opts);
  writeWorkbenchHomeSettings({
    defaultProjectId: current.defaultProjectId,
    workbenchProjectIds: current.workbenchProjectIds,
    projectDirectoryById: index,
  }, opts);
}

export function rememberProjectDirectory(
  entry: ProjectDirectoryEntry,
  opts?: WorkbenchHomeOpts,
): ProjectDirectoryIndex {
  const next = mergeProjectDirectory(readProjectDirectory(opts), entry);
  writeProjectDirectory(next, opts);
  return next;
}

export function markProjectDirectoryRemoved(
  projectId: string,
  opts?: WorkbenchHomeOpts,
): ProjectDirectoryIndex {
  const next = markProjectRemoved(readProjectDirectory(opts), projectId);
  writeProjectDirectory(next, opts);
  return next;
}

export function syncProjectDirectoryMembers(
  members: ReadonlyArray<{ id: string; lastPath: string; displayName?: string }>,
  opts?: WorkbenchHomeOpts,
): ProjectDirectoryIndex {
  let index = readProjectDirectory(opts);
  for (const member of members) {
    index = mergeProjectDirectory(index, {
      projectId: member.id,
      lastPath: member.lastPath,
      displayName: member.displayName,
    });
  }
  writeProjectDirectory(index, opts);
  return index;
}

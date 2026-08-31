/**
 * Last-known project roots, including workbench members that were removed.
 * Persisted as `projectDirectoryById` in ~/.prismnext/settings.json.
 */

export type ProjectDirectoryEntry = {
  projectId: string;
  lastPath: string;
  displayName?: string;
  removedFromWorkbenchAt?: string;
};

export type ProjectDirectoryIndex = Record<string, ProjectDirectoryEntry>;

export function parseProjectDirectoryIndex(raw: unknown): ProjectDirectoryIndex {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProjectDirectoryIndex = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const projectId = id.trim();
    if (!projectId || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const lastPath = (value as { lastPath?: unknown }).lastPath;
    if (typeof lastPath !== "string" || !lastPath.trim()) continue;
    const entry: ProjectDirectoryEntry = {
      projectId,
      lastPath: lastPath.trim(),
    };
    const displayName = (value as { displayName?: unknown }).displayName;
    if (typeof displayName === "string" && displayName.trim()) {
      entry.displayName = displayName.trim();
    }
    const removed = (value as { removedFromWorkbenchAt?: unknown }).removedFromWorkbenchAt;
    if (typeof removed === "string" && removed.trim()) {
      entry.removedFromWorkbenchAt = removed.trim();
    }
    out[projectId] = entry;
  }
  return out;
}

export function mergeProjectDirectory(
  index: ProjectDirectoryIndex,
  entry: ProjectDirectoryEntry,
): ProjectDirectoryIndex {
  const projectId = entry.projectId.trim();
  const lastPath = entry.lastPath.trim();
  if (!projectId || !lastPath) return index;
  const prev = index[projectId];
  const displayName = entry.displayName?.trim() || prev?.displayName;
  const next: ProjectDirectoryEntry = { projectId, lastPath };
  if (displayName) next.displayName = displayName;
  return { ...index, [projectId]: next };
}

export function markProjectRemoved(
  index: ProjectDirectoryIndex,
  projectId: string,
  at = new Date().toISOString(),
): ProjectDirectoryIndex {
  const id = projectId.trim();
  const prev = index[id];
  if (!prev) return index;
  return {
    ...index,
    [id]: { ...prev, removedFromWorkbenchAt: at },
  };
}

export function collectOrphanProjectIds(input: {
  memberIds: Iterable<string>;
  projectDirectory: ProjectDirectoryIndex;
  sessionProjectIds: Record<string, string>;
}): string[] {
  const members = new Set(
    [...input.memberIds].map((id) => id.trim()).filter(Boolean),
  );
  const ids = new Set<string>();
  for (const projectId of Object.values(input.sessionProjectIds)) {
    const id = projectId.trim();
    if (id) ids.add(id);
  }
  for (const [id, entry] of Object.entries(input.projectDirectory)) {
    if (entry.removedFromWorkbenchAt) ids.add(id);
  }
  return [...ids]
    .filter((id) => !members.has(id) && Boolean(input.projectDirectory[id]?.lastPath.trim()))
    .sort();
}

export function listSessionFetchTargets(input: {
  members: ReadonlyArray<{ id: string; lastPath: string; displayName: string }>;
  projectDirectory: ProjectDirectoryIndex;
  sessionProjectIds: Record<string, string>;
}): Array<{ id: string; lastPath: string; displayName: string }> {
  const memberIds = input.members.map((member) => member.id);
  const orphans = collectOrphanProjectIds({
    memberIds,
    projectDirectory: input.projectDirectory,
    sessionProjectIds: input.sessionProjectIds,
  });
  return [
    ...input.members,
    ...orphans.map((id) => {
      const entry = input.projectDirectory[id];
      return {
        id,
        lastPath: entry?.lastPath ?? "",
        displayName: entry?.displayName?.trim() || id,
      };
    }),
  ];
}

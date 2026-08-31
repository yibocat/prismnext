import { isRemoteProjectRoot, parseRemoteAbs, recoverRemoteAbs } from "@shared/remote";
import {
  filterRemoteHostProjects,
  listRemoteHostProjects,
} from "@/lib/remote/host-projects";
import { sameProjectPath } from "@/stores/workbench-store";

export type UnifiedRecentRow = {
  path: string;
  name: string;
  kind: "local" | "remote";
  trailing?: string;
  description?: string;
  onWorkbench: boolean;
  isDefault: boolean;
  lastOpened: number;
};

export type UnifiedRepoEntry = {
  path: string;
  name: string;
  description: string;
};

export type UnifiedRecentInput = {
  path: string;
  name: string;
  lastOpened: number;
};

function canonicalPath(path: string): string {
  const trimmed = path.trim();
  return recoverRemoteAbs(trimmed) ?? trimmed;
}

function remoteName(path: string, fallback: string): string {
  const parsed = parseRemoteAbs(path);
  const fromAbs = parsed?.abs.split("/").filter(Boolean).at(-1);
  return fallback.trim() || fromAbs || parsed?.abs || path;
}

function matchesQuery(row: {
  name: string;
  path: string;
  trailing?: string;
  description?: string;
}, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.name.toLowerCase().includes(q)
    || row.path.toLowerCase().includes(q)
    || (row.trailing?.toLowerCase().includes(q) ?? false)
    || (row.description?.toLowerCase().includes(q) ?? false)
  );
}

export function listUnifiedRecents(input: {
  recentProjects: ReadonlyArray<UnifiedRecentInput>;
  memberPaths: ReadonlyArray<string>;
  defaultProject: { path: string; name: string } | null;
  query: string;
}): UnifiedRecentRow[] {
  const list = [...input.recentProjects];
  const defaultPath = input.defaultProject?.path.trim()
    ? canonicalPath(input.defaultProject.path)
    : "";
  if (
    defaultPath
    && !list.some((item) => sameProjectPath(item.path, defaultPath))
  ) {
    list.unshift({
      path: defaultPath,
      name: input.defaultProject?.name ?? defaultPath,
      lastOpened: Number.MAX_SAFE_INTEGER,
    });
  }

  const rows: UnifiedRecentRow[] = list.map((item) => {
    const path = canonicalPath(item.path);
    const parsed = parseRemoteAbs(path);
    const isDefault = Boolean(defaultPath && sameProjectPath(path, defaultPath));
    return {
      path,
      name: parsed ? remoteName(path, item.name) : item.name,
      kind: parsed ? "remote" : "local",
      trailing: parsed?.profileId ?? path,
      description: parsed ? parsed.abs : path,
      onWorkbench: input.memberPaths.some((memberPath) => sameProjectPath(memberPath, path)),
      isDefault,
      lastOpened: isDefault ? Number.MAX_SAFE_INTEGER : item.lastOpened,
    };
  });

  return rows
    .filter((row) => matchesQuery(row, input.query))
    .sort((a, b) => b.lastOpened - a.lastOpened);
}

export function listLocalRepoEntries(
  members: ReadonlyArray<{ lastPath: string; displayName: string }>,
  query: string,
): UnifiedRepoEntry[] {
  return members
    .filter((member) => !isRemoteProjectRoot(member.lastPath))
    .map((member) => ({
      path: member.lastPath,
      name: member.displayName,
      description: member.lastPath,
    }))
    .filter((row) => matchesQuery(row, query));
}

export function listRemoteRepoEntries(
  profileId: string,
  members: ReadonlyArray<{ lastPath: string; displayName: string }>,
  recents: ReadonlyArray<{ path: string; name: string }>,
  query: string,
): UnifiedRepoEntry[] {
  return filterRemoteHostProjects(
    listRemoteHostProjects(profileId, recents, members),
    query,
  ).map((item) => ({
    path: item.lastPath,
    name: item.name,
    description: item.remoteRoot,
  }));
}

export function visibleUnifiedRecents(
  rows: ReadonlyArray<UnifiedRecentRow>,
  opts: { expanded: boolean; previewCount: number },
): { items: UnifiedRecentRow[]; remaining: number } {
  if (opts.expanded || rows.length <= opts.previewCount) {
    return { items: [...rows], remaining: 0 };
  }
  return {
    items: rows.slice(0, opts.previewCount),
    remaining: rows.length - opts.previewCount,
  };
}

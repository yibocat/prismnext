import { remoteDesktop } from "@/lib/desktop-api/remote";
import {
  isRemoteDirListing,
  parseRemoteAbs,
  type RemoteDirListing,
} from "@shared/remote";

export type RemoteHostNextAction =
  | { type: "idle" }
  | { type: "open-folder" }
  | { type: "create" }
  | { type: "open-path"; remoteRoot: string };

export type RemoteHostProject = {
  lastPath: string;
  remoteRoot: string;
  name: string;
};

export function listRemoteHostProjects(
  profileId: string,
  recents: ReadonlyArray<{ path: string; name: string }>,
  members: ReadonlyArray<{ lastPath: string; displayName: string }>,
): RemoteHostProject[] {
  const seen = new Set<string>();
  const out: RemoteHostProject[] = [];
  const consider = (path: string, name: string) => {
    const parsed = parseRemoteAbs(path);
    if (!parsed || parsed.profileId !== profileId || seen.has(parsed.abs)) return;
    seen.add(parsed.abs);
    const fallback = parsed.abs.split("/").filter(Boolean).at(-1) || parsed.abs;
    out.push({
      lastPath: path,
      remoteRoot: parsed.abs,
      name: name.trim() || fallback,
    });
  };
  for (const member of members) consider(member.lastPath, member.displayName);
  for (const recent of recents) consider(recent.path, recent.name);
  return out;
}

export function filterRemoteHostProjects(
  items: ReadonlyArray<RemoteHostProject>,
  query: string,
): RemoteHostProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) => (
    item.name.toLowerCase().includes(q) || item.remoteRoot.toLowerCase().includes(q)
  ));
}

export async function listRemoteHostDir(
  profileId: string,
  path: string,
): Promise<RemoteDirListing> {
  const listing = await remoteDesktop.remoteListDir({ profileId, path });
  if (!isRemoteDirListing(listing)) {
    throw new Error("Could not list this folder.");
  }
  return listing;
}

export async function mkdirRemoteHostDir(
  profileId: string,
  path: string,
): Promise<void> {
  await remoteDesktop.remoteMkdir({ profileId, path });
}

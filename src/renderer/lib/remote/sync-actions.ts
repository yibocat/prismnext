import { toast } from "sonner";
import { parseRemoteAbs } from "@shared/remote";
import { remoteDesktop } from "@/lib/desktop-api/remote";
import { i18n } from "@/lib/i18n";

function t(key: string, opts?: Record<string, string | number>): string {
  return i18n.t(key, opts);
}

export function workbenchMembersOnProfile(
  members: ReadonlyArray<{ id: string; lastPath: string }>,
  profileId: string,
): Array<{ id: string; lastPath: string }> {
  return members.filter((member) => parseRemoteAbs(member.lastPath)?.profileId === profileId);
}

const profileSyncInFlight = new Set<string>();

export async function syncRemoteSessionsForProfile(
  profileId: string,
  opts?: { silent?: boolean },
): Promise<number> {
  const alias = profileId.trim();
  if (!alias || profileSyncInFlight.has(alias)) return 0;
  profileSyncInFlight.add(alias);
  try {
    const { useWorkbenchStore } = await import("@/stores/workbench-store");
    const members = workbenchMembersOnProfile(useWorkbenchStore.getState().members, alias);
    let count = 0;
    for (const member of members) {
      try {
        const result = await remoteDesktop.remoteSyncSessions({
          profileId: alias,
          projectId: member.id,
        });
        if (result.ok) count += result.count;
      } catch {
        // Keep other projects; a single Host list failure must not block the rest.
      }
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("prism:session-list-refresh"));
    }
    if (!opts?.silent && count > 0) {
      toast.success(t("remote.sync.sessionsDone", { count }));
    }
    return count;
  } finally {
    profileSyncInFlight.delete(alias);
  }
}

export async function syncRemoteSessionsAction(member: { id: string; lastPath: string }): Promise<void> {
  const parsed = parseRemoteAbs(member.lastPath);
  if (!parsed) return;
  const result = await remoteDesktop.remoteSyncSessions({
    profileId: parsed.profileId,
    projectId: member.id,
  });
  if (result.ok) toast.success(t("remote.sync.sessionsDone", { count: result.count }));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("prism:session-list-refresh"));
  }
}

export async function syncRemoteFileAction(
  member: { id: string; lastPath: string },
  remoteAbs: string,
): Promise<void> {
  const parsed = parseRemoteAbs(member.lastPath);
  if (!parsed) return;
  const result = await remoteDesktop.remoteSyncFile({
    profileId: parsed.profileId,
    projectId: member.id,
    remoteAbs,
  });
  if (result.ok) toast.success(t("remote.sync.fileDone"));
  else toast.error(result.error);
}

export async function syncRemotePaperPdfAction(
  member: { id: string; lastPath: string },
  paperId: string,
): Promise<void> {
  const result = await remoteDesktop.remoteSyncPaperPdf({
    projectRoot: member.lastPath,
    paperId,
    projectId: member.id,
  });
  if (result.ok) toast.success(t("remote.sync.pdfDone"));
  else toast.error(result.error);
}

export async function syncRemoteExperimentAction(
  member: { id: string; lastPath: string },
  experimentId: string,
): Promise<void> {
  const result = await remoteDesktop.remoteSyncExperimentArtifacts({
    projectRoot: member.lastPath,
    projectId: member.id,
    experimentId,
  });
  toast.success(t("remote.sync.experimentDone", { count: result.paths.length }));
}

export async function pushRemoteSkillsAction(lastPath: string): Promise<void> {
  const parsed = parseRemoteAbs(lastPath);
  if (!parsed) return;
  const result = await remoteDesktop.remotePushSkills(parsed.profileId);
  if (result.ok) toast.success(t("remote.sync.skillsDone", { count: result.files }));
  else toast.error(result.error);
}

export async function setRemoteSyncModeAction(
  lastPath: string,
  mode: "on-demand" | "online-only",
): Promise<void> {
  const parsed = parseRemoteAbs(lastPath);
  if (!parsed) return;
  await remoteDesktop.remoteSetSyncMode(parsed.profileId, mode);
  toast.success(t(`remote.sync.modeSet.${mode}`));
}

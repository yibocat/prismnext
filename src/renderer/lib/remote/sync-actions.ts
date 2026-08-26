import { toast } from "sonner";
import { parseRemoteAbs } from "@shared/remote";
import { remoteDesktop } from "@/lib/desktop-api/remote";
import { i18n } from "@/lib/i18n";

function t(key: string, opts?: Record<string, string | number>): string {
  return i18n.t(key, opts);
}

export async function syncRemoteSessionsAction(member: { id: string; lastPath: string }): Promise<void> {
  const parsed = parseRemoteAbs(member.lastPath);
  if (!parsed) return;
  const result = await remoteDesktop.remoteSyncSessions({
    profileId: parsed.profileId,
    projectId: member.id,
  });
  if (result.ok) toast.success(t("remote.sync.sessionsDone", { count: result.count }));
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

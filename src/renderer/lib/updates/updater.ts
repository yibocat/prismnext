import type { UpdaterStatus } from "@/types/electron";
import { updatesDesktop } from "@/lib/desktop-api/updates";

export function getAboutVersions() {
  return updatesDesktop.aboutGetVersions();
}

export function checkForUpdate() {
  return updatesDesktop.updateCheck();
}

export function getUpdateStatus() {
  return updatesDesktop.updateStatus();
}

export function downloadUpdate() {
  return updatesDesktop.updateDownload();
}

export function subscribeUpdateProgress(
  callback: (data: { percent: number }) => void,
) {
  return updatesDesktop.onUpdateProgress(callback);
}

export function subscribeUpdateChanged(
  callback: (status: UpdaterStatus) => void,
) {
  return updatesDesktop.onUpdateChanged(callback);
}

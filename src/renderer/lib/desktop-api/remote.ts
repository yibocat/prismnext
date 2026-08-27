/**
 * Remote workspace desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 */

import { forwardDesktop } from "./forward";

export const remoteDesktop = {
  remoteListHosts: forwardDesktop("remoteListHosts"),
  remoteTrustHost: forwardDesktop("remoteTrustHost"),
  remoteConnect: forwardDesktop("remoteConnect"),
  remoteDisconnect: forwardDesktop("remoteDisconnect"),
  remoteConnectionStatus: forwardDesktop("remoteConnectionStatus"),
  remoteListDir: forwardDesktop("remoteListDir"),
  remoteMkdir: forwardDesktop("remoteMkdir"),
  remoteOpenProject: forwardDesktop("remoteOpenProject"),
  onRemoteLog: forwardDesktop("onRemoteLog"),
  onRemoteConnection: forwardDesktop("onRemoteConnection"),
  remoteZoteroCancel: forwardDesktop("remoteZoteroCancel"),
  onRemoteZoteroProgress: forwardDesktop("onRemoteZoteroProgress"),
  remoteGetSyncMode: forwardDesktop("remoteGetSyncMode"),
  remoteSetSyncMode: forwardDesktop("remoteSetSyncMode"),
  remoteSyncFile: forwardDesktop("remoteSyncFile"),
  remoteSyncPaperPdf: forwardDesktop("remoteSyncPaperPdf"),
  remoteSyncExperimentArtifacts: forwardDesktop("remoteSyncExperimentArtifacts"),
  remoteSyncSessions: forwardDesktop("remoteSyncSessions"),
  remoteSyncCancel: forwardDesktop("remoteSyncCancel"),
  remotePushSkills: forwardDesktop("remotePushSkills"),
  onRemoteSyncProgress: forwardDesktop("onRemoteSyncProgress"),
};

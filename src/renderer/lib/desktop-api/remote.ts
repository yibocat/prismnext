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
  remoteOpenProject: forwardDesktop("remoteOpenProject"),
  onRemoteLog: forwardDesktop("onRemoteLog"),
  onRemoteConnection: forwardDesktop("onRemoteConnection"),
};

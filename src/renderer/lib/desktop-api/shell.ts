/**
 * OS shell desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 */

import { forwardDesktop } from "./forward";

export const shellDesktop = {
  shellShowItemInFolder: forwardDesktop("shellShowItemInFolder"),
  shellOpenExternal: forwardDesktop("shellOpenExternal"),
  shellSetTrayStatus: forwardDesktop("shellSetTrayStatus"),
  shellSetTrayMenu: forwardDesktop("shellSetTrayMenu"),
  onShellFocusChatTab: forwardDesktop("onShellFocusChatTab"),
  onShellTrayNewChat: forwardDesktop("onShellTrayNewChat"),
  onShellTrayOpenRecent: forwardDesktop("onShellTrayOpenRecent"),
  onShellTrayOpenMode: forwardDesktop("onShellTrayOpenMode"),
  windowIsMaximized: forwardDesktop("windowIsMaximized"),
  windowIsFullscreen: forwardDesktop("windowIsFullscreen"),
  windowClose: forwardDesktop("windowClose"),
  onWindowStateChange: forwardDesktop("onWindowStateChange"),
  onCloseTabRequest: forwardDesktop("onCloseTabRequest"),
};

export function desktopPlatform(): "darwin" | "win32" | "linux" {
  if (typeof window === "undefined") return "darwin";
  return window.electronAPI?.platform ?? "darwin";
}

export function openExternalUrl(url: string): Promise<void> {
  return shellDesktop.shellOpenExternal(url);
}

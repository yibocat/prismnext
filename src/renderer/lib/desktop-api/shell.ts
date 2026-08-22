/**
 * OS shell desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 */

import { forwardDesktop } from "./forward";

export const shellDesktop = {
  shellShowItemInFolder: forwardDesktop("shellShowItemInFolder"),
  shellOpenExternal: forwardDesktop("shellOpenExternal"),
};

export function desktopPlatform(): "darwin" | "win32" | "linux" {
  if (typeof window === "undefined") return "darwin";
  return window.electronAPI?.platform ?? "darwin";
}

export function openExternalUrl(url: string): Promise<void> {
  return shellDesktop.shellOpenExternal(url);
}

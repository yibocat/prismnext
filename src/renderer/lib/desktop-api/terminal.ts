/**
 * Terminal desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by terminal-store. PTY event subscribers are not on this port yet.
 */

import { forwardDesktop } from "./forward";

export const terminalDesktop = {
  terminalSaveConfig: forwardDesktop("terminalSaveConfig"),
  terminalLoadConfig: forwardDesktop("terminalLoadConfig"),
  terminalEnvInfo: forwardDesktop("terminalEnvInfo"),
  terminalDestroyTab: forwardDesktop("terminalDestroyTab"),
  terminalDestroyTabs: forwardDesktop("terminalDestroyTabs"),
};

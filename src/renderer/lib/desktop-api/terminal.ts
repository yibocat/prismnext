/**
 * Terminal desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by terminal-store and terminal-mode (PTY create/write/resize/events).
 */

import { forwardDesktop } from "./forward";

export const terminalDesktop = {
  terminalSaveConfig: forwardDesktop("terminalSaveConfig"),
  terminalLoadConfig: forwardDesktop("terminalLoadConfig"),
  terminalEnvInfo: forwardDesktop("terminalEnvInfo"),
  terminalCreate: forwardDesktop("terminalCreate"),
  terminalDestroy: forwardDesktop("terminalDestroy"),
  terminalDestroyTab: forwardDesktop("terminalDestroyTab"),
  terminalDestroyTabs: forwardDesktop("terminalDestroyTabs"),
  terminalWrite: forwardDesktop("terminalWrite"),
  terminalResize: forwardDesktop("terminalResize"),
  onTerminalData: forwardDesktop("onTerminalData"),
  onTerminalExit: forwardDesktop("onTerminalExit"),
};

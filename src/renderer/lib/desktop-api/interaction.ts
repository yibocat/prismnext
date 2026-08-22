/**
 * Interaction desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by interaction-mode, chat interaction cards, and registry-changed focus.
 */

import { forwardDesktop } from "./forward";

export const interactionDesktop = {
  interactionGet: forwardDesktop("interactionGet"),
  interactionList: forwardDesktop("interactionList"),
  interactionWrite: forwardDesktop("interactionWrite"),
  onInteractionChanged: forwardDesktop("onInteractionChanged"),
};

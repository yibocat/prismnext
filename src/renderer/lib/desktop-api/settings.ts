/**
 * Settings desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by settings-store, theme-store, and settings persist helpers in lib/.
 */

import { forwardDesktop } from "./forward";

export const settingsDesktop = {
  settingsGet: forwardDesktop("settingsGet"),
  settingsSet: forwardDesktop("settingsSet"),
  themeSetGlassMode: forwardDesktop("themeSetGlassMode"),
  settingsGetKnowledgeModules: forwardDesktop("settingsGetKnowledgeModules"),
  settingsGetPromptStackPreview: forwardDesktop("settingsGetPromptStackPreview"),
  settingsGetBuiltinTools: forwardDesktop("settingsGetBuiltinTools"),
  settingsCountPromptTokens: forwardDesktop("settingsCountPromptTokens"),
  settingsGetDefaultPersona: forwardDesktop("settingsGetDefaultPersona"),
  onExpertsIntegrationChanged: forwardDesktop("onExpertsIntegrationChanged"),
};

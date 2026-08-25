/**
 * Slash-command desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by command-store. Team roster lookup stays on teamsDesktop.
 */

import { forwardDesktop } from "./forward";

export const commandsDesktop = {
  commandsList: forwardDesktop("commandsList"),
  commandsExpand: forwardDesktop("commandsExpand"),
  commandsCreate: forwardDesktop("commandsCreate"),
  commandsUpdate: forwardDesktop("commandsUpdate"),
  commandsDelete: forwardDesktop("commandsDelete"),
  commandsToggle: forwardDesktop("commandsToggle"),
  commandsReload: forwardDesktop("commandsReload"),
  commandsPreviewImport: forwardDesktop("commandsPreviewImport"),
  commandsImportPack: forwardDesktop("commandsImportPack"),
  commandsWriteExportFile: forwardDesktop("commandsWriteExportFile"),
  commandsReadImportFile: forwardDesktop("commandsReadImportFile"),
};

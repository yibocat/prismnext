/**
 * Manuscript template desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 */

import { forwardDesktop } from "./forward";

export const templateDesktop = {
  templateGet: forwardDesktop("templateGet"),
  templateApply: forwardDesktop("templateApply"),
  templateDetectChanges: forwardDesktop("templateDetectChanges"),
  templateBackup: forwardDesktop("templateBackup"),
  templateListBackups: forwardDesktop("templateListBackups"),
  templateRestoreBackup: forwardDesktop("templateRestoreBackup"),
  templateDeleteBackup: forwardDesktop("templateDeleteBackup"),
};

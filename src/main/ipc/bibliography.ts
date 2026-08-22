import { ipcMain } from "electron";
import { resolveBibliographicMetadata } from "../literature/host";

/**
 * Global bibliographic catalog IPC — not scoped to the literature library UI.
 * Literature mode, commands, and future skills should call this domain.
 */
export function registerBibliographyHandlers(): void {
  ipcMain.handle(
    "bibliography:resolve",
    async (_event, args: { doi?: string; arxivId?: string }) => {
      return resolveBibliographicMetadata({ doi: args.doi, arxivId: args.arxivId });
    },
  );
}

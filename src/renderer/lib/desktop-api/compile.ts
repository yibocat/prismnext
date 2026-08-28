/**
 * Compile desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by compile-store.
 */

import { forwardDesktop } from "./forward";

export const compileDesktop = {
  compileExecute: forwardDesktop("compileExecute"),
  compileTypstLive: forwardDesktop("compileTypstLive"),
  compileTypstExport: forwardDesktop("compileTypstExport"),
  compileDetectTexlive: forwardDesktop("compileDetectTexlive"),
  compileExportPdf: forwardDesktop("compileExportPdf"),
  manuscriptPackZip: forwardDesktop("manuscriptPackZip"),
  onCompileAgentComplete: forwardDesktop("onCompileAgentComplete"),
};

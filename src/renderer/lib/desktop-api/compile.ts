/**
 * Compile desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * LaTeX PDF: compile-store → compileExecute.
 * Typst live: typst-session-store (Tinymist). PDF / export: typst-live-store → compileExecute / compileTypstExport.
 */

import { forwardDesktop } from "./forward";

export const compileDesktop = {
  compileExecute: forwardDesktop("compileExecute"),
  compileTypstExport: forwardDesktop("compileTypstExport"),
  compileDetectTexlive: forwardDesktop("compileDetectTexlive"),
  compileExportPdf: forwardDesktop("compileExportPdf"),
  manuscriptPackZip: forwardDesktop("manuscriptPackZip"),
  onCompileAgentComplete: forwardDesktop("onCompileAgentComplete"),
};

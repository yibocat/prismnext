/**
 * Typst / Tinymist desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Live preview: typst-session-store (P3). PDF oneshot stays on compileDesktop.
 */

import { forwardDesktop } from "./forward";

export const typstDesktop = {
  typstEnsureSession: forwardDesktop("typstEnsureSession"),
  typstDidOpen: forwardDesktop("typstDidOpen"),
  typstDidChange: forwardDesktop("typstDidChange"),
  typstDidClose: forwardDesktop("typstDidClose"),
  typstPreviewStart: forwardDesktop("typstPreviewStart"),
  typstPreviewStop: forwardDesktop("typstPreviewStop"),
  onTypstPreviewReady: forwardDesktop("onTypstPreviewReady"),
  onTypstDiagnostics: forwardDesktop("onTypstDiagnostics"),
  onTypstScrollTo: forwardDesktop("onTypstScrollTo"),
};

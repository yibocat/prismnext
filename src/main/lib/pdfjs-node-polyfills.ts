import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let installed = false;

/** Browser canvas globals pdf.js expects when loaded in Electron main (Node). */
export function installPdfjsNodePolyfills(): void {
  if (installed) return;
  installed = true;

  try {
    const canvas = require("@napi-rs/canvas") as {
      DOMMatrix?: typeof globalThis.DOMMatrix;
      ImageData?: typeof globalThis.ImageData;
      Path2D?: typeof globalThis.Path2D;
    };
    if (!globalThis.DOMMatrix && canvas.DOMMatrix) {
      globalThis.DOMMatrix = canvas.DOMMatrix;
    }
    if (!globalThis.ImageData && canvas.ImageData) {
      globalThis.ImageData = canvas.ImageData;
    }
    if (!globalThis.Path2D && canvas.Path2D) {
      globalThis.Path2D = canvas.Path2D;
    }
  } catch {
    // pdf.js will warn and text extraction may still work for simple PDFs.
  }
}

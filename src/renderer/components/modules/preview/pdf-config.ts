import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/**
 * pdf.js loads cmaps / standard fonts from the worker. Relative URLs resolve
 * against the worker script (e.g. /assets/pdf.worker-*.mjs), not the page — so
 * Chinese/CJK PDFs fail silently without absolute paths to public/pdfjs-dist.
 */
function pdfjsAssetDir(...segments: string[]): string {
  const subpath = ["pdfjs-dist", ...segments].filter(Boolean).join("/");
  const withTrailingSlash = subpath.endsWith("/") ? subpath : `${subpath}/`;
  if (typeof window === "undefined") {
    return `./${withTrailingSlash}`;
  }
  return new URL(withTrailingSlash, window.location.href).href;
}

export const PDFJS_DOCUMENT_OPTIONS = {
  cMapUrl: pdfjsAssetDir("cmaps"),
  cMapPacked: true,
  standardFontDataUrl: pdfjsAssetDir("standard_fonts"),
  wasmUrl: pdfjsAssetDir("wasm"),
  iccUrl: pdfjsAssetDir("iccs"),
} as const;

/**
 * pdf.js transfers TypedArray PDF data to the worker (detaches the buffer).
 * Always pass a copy into Lector / getDocument so cached bytes stay reusable
 * (chat artifact dialog reopen, remounts, etc.).
 */
export function copyPdfSourceForViewer(
  source: string | Uint8Array,
): string | Uint8Array {
  if (source instanceof Uint8Array) return source.slice();
  return source;
}

/** Decode `data:application/pdf;base64,…` (e.g. template:getPdfData) for pdf.js. */
export function pdfDataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const PDF_PAGES_CLASS =
  "prism-pdf-pages flex-1 min-w-0 overflow-auto overscroll-contain select-text";

export const PDF_PAGES_DARK_CLASS = "prism-pdf-pages--dark";

export const PDF_PAGES_STYLE = { justifyContent: "flex-start" } as const;

export const PDF_PAGE_CLASS = "prism-pdf-page bg-white";

export const PDF_PAGE_INVERTED_CLASS = "prism-pdf-page--inverted";

/** Invert stack — tuned with user (brightness 91%). */
export const PDF_PAGE_DARK_FILTER =
  " invert-[92%] hue-rotate-180 brightness-[91%] contrast-[165%] saturate-[92%]";

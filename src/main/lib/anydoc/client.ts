import { createRequire } from "node:module";
import { anydocUnavailableError, mapConvertError, type DocumentReadError } from "./errors";

type AnyDocModule = {
  toMarkdown: (path: string) => Promise<string>;
  formatFromPath?: (path: string) => string | null;
};

export type ConvertFileOk = {
  ok: true;
  markdown: string;
  format: string | null;
};

let injected: AnyDocModule | null = null;
let loaded: AnyDocModule | null | undefined;

/** Tests replace the native module without touching Electron ABI. */
export function _setAnydocModuleForTests(mod: AnyDocModule | null): void {
  injected = mod;
  loaded = undefined;
}

export function getAnydocEngineVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req("@firecrawl/anydoc/package.json") as { version?: string };
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function isLoadError(value: AnyDocModule | DocumentReadError): value is DocumentReadError {
  return "ok" in value && value.ok === false;
}

function coerceAnydocModule(ns: unknown): AnyDocModule | null {
  if (!ns || typeof ns !== "object") return null;
  const rec = ns as AnyDocModule & { default?: AnyDocModule };
  if (typeof rec.toMarkdown === "function") return rec;
  if (rec.default && typeof rec.default.toMarkdown === "function") return rec.default;
  return null;
}

async function loadAnydoc(): Promise<AnyDocModule | DocumentReadError> {
  if (injected) return injected;
  if (loaded) return loaded;
  try {
    const ns = await import("@firecrawl/anydoc");
    const mod = coerceAnydocModule(ns);
    if (!mod) {
      return anydocUnavailableError("toMarkdown is missing.");
    }
    loaded = mod;
    return mod;
  } catch (err) {
    loaded = null;
    const mapped = mapConvertError(err);
    return mapped.error === "anydoc_unavailable"
      ? mapped
      : anydocUnavailableError(err instanceof Error ? err.message : String(err));
  }
}

export async function convertFileToMarkdown(
  absPath: string,
  signal?: AbortSignal,
): Promise<ConvertFileOk | DocumentReadError> {
  if (signal?.aborted) {
    return { ok: false, error: "anydoc_convert_failed", message: "Conversion aborted." };
  }
  const mod = await loadAnydoc();
  if (isLoadError(mod)) return mod;
  const anydoc = mod;
  try {
    const markdown = await anydoc.toMarkdown(absPath);
    if (signal?.aborted) {
      return { ok: false, error: "anydoc_convert_failed", message: "Conversion aborted." };
    }
    const format = typeof anydoc.formatFromPath === "function"
      ? anydoc.formatFromPath(absPath)
      : null;
    return { ok: true, markdown, format };
  } catch (err) {
    return mapConvertError(err);
  }
}

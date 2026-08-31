import { pathToFileURL } from "node:url";
import type { TypstScrollToEvent } from "./session";
import { typstRelFromUri } from "./uri";

export const TINYMIST_CMD = {
  startPreview: "tinymist.doStartPreview",
  killPreview: "tinymist.doKillPreview",
  scrollPreview: "tinymist.scrollPreview",
} as const;

export const TINYMIST_NOTE = {
  dispose: "tinymist/preview/dispose",
  scrollSource: "tinymist/preview/scrollSource",
} as const;

export const TINYMIST_INIT_OPTIONS = {
  exportPdf: "never",
  formatterMode: "disable",
  preview: {
    cursorIndicator: false,
    refresh: "onType",
  },
} as const;

export function resolveTinymistConfigSection(section: string | undefined): unknown {
  if (!section || section === "tinymist") return TINYMIST_INIT_OPTIONS;
  const path = section.startsWith("tinymist.") ? section.slice("tinymist.".length) : section;
  let current: unknown = TINYMIST_INIT_OPTIONS;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveTinymistConfigurationItems(params: unknown): unknown[] {
  const items =
    params && typeof params === "object" && "items" in params
      ? (params as { items: Array<{ section?: string }> }).items
      : [];
  if (!Array.isArray(items) || items.length === 0) return [TINYMIST_INIT_OPTIONS];
  return items.map((item) => resolveTinymistConfigSection(item?.section));
}

/** Tinymist `tinymist/preview/scrollSource` JumpInfo → TypstScrollToEvent. */
export function parseTinymistScrollSource(
  projectRoot: string,
  jump: unknown,
): TypstScrollToEvent | null {
  if (!jump || typeof jump !== "object") return null;
  const rec = jump as { filepath?: unknown; start?: unknown };
  if (typeof rec.filepath !== "string" || rec.filepath.length === 0) return null;
  if (!Array.isArray(rec.start) || typeof rec.start[0] !== "number") return null;
  const line0 = rec.start[0];
  const character = typeof rec.start[1] === "number" ? rec.start[1] : 0;
  const uri = rec.filepath.startsWith("file:")
    ? rec.filepath
    : pathToFileURL(rec.filepath).href;
  const relPath = typstRelFromUri(projectRoot, uri);
  if (!relPath) return null;
  return {
    projectRoot,
    relPath,
    line: line0 + 1,
    character,
  };
}

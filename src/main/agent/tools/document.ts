/**
 * Native document-read — local AnyDoc conversion to Markdown.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";
import { isPathInsideProject, resolvePathInProject } from "../../../shared/permissions/smart-policy";
import {
  assertReadableExtension,
  assertReadableSize,
  documentReadError,
  mapConvertSuccess,
  readDocumentMarkdownCached,
} from "../../lib/anydoc";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function displayPath(raw: string, absPath: string, projectRoot: string): string {
  const rel = relative(projectRoot, absPath);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    return rel.replace(/\\/g, "/");
  }
  return raw;
}

export const documentReadTool: NativeToolDefinition = {
  name: TOOL_NAMES.documentRead,
  label: "Document Read",
  description:
    "Convert a project Office / OpenDocument / RTF / EPUB / CSV / PDF file to Markdown. "
    + "Not for library paper PDFs on the intensive-reading list.",
  promptSnippet: "Read local Word, slides, spreadsheets, EPUB, CSV, or PDF as markdown.",
  promptGuidelines: [
    "If this turn already includes converted attachment Markdown (`[DOCX attachment: …]`), use that. Do not ls/read a different project file in its place.",
    "If the user attached an Office/PDF file and this turn has no converted Markdown for it, say you cannot read it. Do not invent the document. Do not present another project file as that attachment.",
    "Project files in the AnyDoc whitelist (.doc/.docx/.ppt/.pptx/.xls/.xlsx/.odt/.ods/.odp/.rtf/.epub/.csv/.pdf) → this tool. Do not unzip with bash or send binaries to read.",
    "Library paper PDFs on the intensive-reading list → literature-read-pdf (MinerU), even if the file is also a .pdf on disk.",
    "Plain source (.md, .tex, .py, …) → read / grep, not document-read.",
    "Large decks, sheets, or PDFs: pass query to keep matching lines instead of dumping the whole file.",
    "Scanned PDFs fail here (no OCR). Suggest literature-read-pdf after adding the paper, or a text copy.",
    "Do not use webfetch for a local file path.",
  ],
  parameters: Type.Object({
    path: Type.String({ minLength: 1, description: "Project-relative or absolute path to the document" }),
    query: Type.Optional(Type.String({
      description: "Optional keyword filter applied to the converted Markdown",
    })),
  }),
  permission: {
    category: "read_only",
    extractPath: (args) => str(args.path),
  },
  async execute(args, ctx) {
    const raw = str(args.path);
    if (!raw) return documentReadError("missing_path", "path is required");

    const absPath = resolvePathInProject(raw, ctx.projectRoot);
    if (isPathInsideProject(absPath, ctx.projectRoot) === false) {
      return documentReadError(
        "path_outside_project",
        "Path is outside the current project. Use a file inside the project or worktree.",
      );
    }

    const extOk = assertReadableExtension(absPath);
    if (!extOk.ok) return extOk;

    if (!existsSync(absPath)) {
      return documentReadError("file_not_found", `File not found: ${raw}`);
    }

    let size = 0;
    try {
      const st = statSync(absPath);
      if (!st.isFile()) {
        return documentReadError("file_not_found", `Not a regular file: ${raw}`);
      }
      size = st.size;
    } catch {
      return documentReadError("file_not_found", `File not found: ${raw}`);
    }

    const sizeOk = assertReadableSize(size);
    if (!sizeOk.ok) return sizeOk;

    const cached = await readDocumentMarkdownCached(absPath, { signal: ctx.abortSignal });
    if (!cached.ok) return cached;

    return mapConvertSuccess({
      path: displayPath(raw, absPath, ctx.projectRoot),
      absPath,
      format: cached.format,
      markdown: cached.markdown,
      query: str(args.query) || undefined,
      cacheHit: cached.cacheHit,
      alreadyTruncated: cached.truncated,
    });
  },
};

export const DOCUMENT_TOOLS: NativeToolDefinition[] = [documentReadTool];

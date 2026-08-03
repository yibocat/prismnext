/**
 * Drag-and-drop payloads for Chat Composer inline tokens.
 */
import type { ContextInsertRequest, CodeSnippetRequest } from "@/lib/chat/context-insert";
import type { GitDiffSnippetRequest } from "@/lib/chat/context-insert";
import type { ExperimentRunSnippetRequest } from "@/lib/chat/context-insert";
import type { ExtractBlockType } from "../../../shared/paper-extract-block";
import { applyComposerDragPreview } from "./composer-drag-preview";

export const COMPOSER_INSERT_MIME = "application/vnd.prismnext.composer-insert+json";

export type ComposerDragPayload =
  | { v: 1; kind: "file-mention"; filePath: string; fileId: string; label: string }
  | {
      v: 1;
      kind: "paper-mention";
      paperId: string;
      bibkey: string;
      title: string;
      label?: string;
    }
  | {
      v: 1;
      kind: "paper-snippet";
      bibkey: string;
      title: string;
      page: number;
      quotedText: string;
      paperId?: string;
      blockId?: string;
      blockType?: ExtractBlockType;
      extractSource?: "mineru";
    }
  | { v: 1; kind: "experiment-mention"; experimentId: string; label: string }
  | ({ v: 1; kind: "experiment-run" } & Omit<ExperimentRunSnippetRequest, "kind">)
  | { v: 1; kind: "link"; url: string; label?: string }
  | ({ v: 1; kind: "code-snippet" } & Omit<CodeSnippetRequest, "kind">)
  | ({ v: 1; kind: "git-diff" } & Omit<GitDiffSnippetRequest, "kind">);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComposerDragPayload(value: unknown): value is ComposerDragPayload {
  if (!isRecord(value) || value.v !== 1 || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "file-mention":
      return (
        typeof value.filePath === "string"
        && typeof value.fileId === "string"
        && typeof value.label === "string"
      );
    case "paper-mention":
      return (
        typeof value.paperId === "string"
        && typeof value.bibkey === "string"
        && typeof value.title === "string"
      );
    case "paper-snippet":
      return (
        typeof value.bibkey === "string"
        && typeof value.title === "string"
        && typeof value.page === "number"
        && typeof value.quotedText === "string"
      );
    case "experiment-mention":
      return typeof value.experimentId === "string" && typeof value.label === "string";
    case "experiment-run":
      return typeof value.runId === "string" && typeof value.command === "string";
    case "link":
      return typeof value.url === "string";
    case "code-snippet":
      return (
        typeof value.filePath === "string"
        && typeof value.text === "string"
        && typeof value.startLine === "number"
        && typeof value.endLine === "number"
        && (value.source === "editor" || value.source === "git-diff")
      );
    case "git-diff":
      return (
        typeof value.filePath === "string"
        && Array.isArray(value.hunks)
        && typeof value.removedLineCount === "number"
        && typeof value.addedLineCount === "number"
        && (value.layout === "unified" || value.layout === "split")
      );
    default:
      return false;
  }
}

export function serializeComposerDragPayloads(payloads: ComposerDragPayload[]): string {
  return JSON.stringify(payloads);
}

export function parseComposerDragPayloads(raw: string): ComposerDragPayload[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(isComposerDragPayload);
  } catch {
    return [];
  }
}

function plainTextForPayloads(payloads: ComposerDragPayload[]): string {
  return payloads
    .map((p) => {
      if (p.kind === "file-mention") return p.filePath;
      if (p.kind === "paper-mention") return p.bibkey;
      if (p.kind === "paper-snippet") return `${p.bibkey}:p${p.page}`;
      if (p.kind === "experiment-mention") return p.label;
      if (p.kind === "experiment-run") return p.runId;
      if (p.kind === "link") return p.url;
      if (p.kind === "code-snippet") return p.text.slice(0, 120);
      if (p.kind === "git-diff") return p.filePath;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function isComposerInsertDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(COMPOSER_INSERT_MIME);
}

export function setComposerDragData(
  dt: DataTransfer,
  payloads: ComposerDragPayload[],
  plainText?: string,
): void {
  if (payloads.length === 0) return;
  dt.setData(COMPOSER_INSERT_MIME, serializeComposerDragPayloads(payloads));
  // Fallback plain text for external targets only — composer drop handlers must
  // consume COMPOSER_INSERT_MIME and preventDefault so CodeMirror never inserts this.
  dt.setData("text/plain", plainText ?? plainTextForPayloads(payloads));
  dt.effectAllowed = "copy";
  applyComposerDragPreview(dt, payloads);
}

/**
 * Accept an internal composer drag on drop. Returns payloads when handled.
 * Always preventDefault + stopPropagation to avoid duplicate inserts.
 */
export function acceptComposerDrop(event: {
  preventDefault(): void;
  stopPropagation(): void;
  dataTransfer: DataTransfer | null;
}): ComposerDragPayload[] | null {
  const payloads = readComposerDragPayloads(event.dataTransfer);
  if (payloads.length === 0) return null;
  event.preventDefault();
  event.stopPropagation();
  return payloads;
}

export function readComposerDragPayloads(dt: DataTransfer | null): ComposerDragPayload[] {
  if (!dt) return [];
  const raw = dt.getData(COMPOSER_INSERT_MIME);
  if (raw) {
    const parsed = parseComposerDragPayloads(raw);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

export function dragPayloadToContextRequest(payload: ComposerDragPayload): ContextInsertRequest {
  switch (payload.kind) {
    case "file-mention":
      return {
        kind: "file-mention",
        filePath: payload.filePath,
        fileId: payload.fileId,
        label: payload.label,
      };
    case "paper-mention":
      return {
        kind: "paper-mention",
        paperId: payload.paperId,
        bibkey: payload.bibkey,
        title: payload.title,
        label: payload.label,
      };
    case "paper-snippet":
      return {
        kind: "paper",
        bibkey: payload.bibkey,
        title: payload.title,
        page: payload.page,
        quotedText: payload.quotedText,
        paperId: payload.paperId,
        blockId: payload.blockId,
        blockType: payload.blockType,
        extractSource: payload.extractSource,
      };
    case "experiment-mention":
      return {
        kind: "experiment-mention",
        experimentId: payload.experimentId,
        label: payload.label,
      };
    case "experiment-run": {
      const { kind: _kind, v: _v, ...rest } = payload;
      return { kind: "experiment-run", ...rest };
    }
    case "link":
      return {
        kind: "link",
        url: payload.url,
        label: payload.label,
      };
    case "code-snippet": {
      const { kind: _kind, v: _v, ...rest } = payload;
      return { kind: "code", ...rest };
    }
    case "git-diff": {
      const { kind: _kind, v: _v, ...rest } = payload;
      return { kind: "git-diff", ...rest };
    }
  }
}

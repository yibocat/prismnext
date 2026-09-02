import { dialogDesktop } from "@/lib/desktop-api/dialog";
import { fsDesktop } from "@/lib/desktop-api/fs";
import type { ProjectFile } from "@/stores/document-store";
import { useDocumentStore } from "@/stores/document-store";

/** Vision-capable image payload for ACP `ContentBlock::Image`. */
export interface PromptImageAttachment {
  mimeType: string;
  /** Raw base64 (no data: prefix). */
  data: string;
  name: string;
  /** file:// URI hint for OpenCode. */
  uri?: string;
}

/**
 * Non-image composer attachment → ACP file block.
 * Prefer `resource_link` (path reference) over dumping bodies into the text prompt.
 * @see https://agentclientprotocol.com/protocol/v1/content
 */
export interface PromptFileAttachment {
  /** ACP `resource_link` — agent reads via tools / OpenCode file parts. */
  kind: "resource_link";
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

const VISION_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isVisionImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
}

export function pathToFileUri(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

export function mimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "markdown":
      return "text/markdown";
    case "txt":
    case "log":
      return "text/plain";
    case "tex":
    case "latex":
    case "sty":
    case "cls":
    case "bib":
      return "text/x-tex";
    case "json":
      return "application/json";
    case "ts":
    case "tsx":
      return "text/typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "text/javascript";
    case "py":
      return "text/x-python";
    case "html":
    case "htm":
      return "text/html";
    case "css":
      return "text/css";
    case "csv":
      return "text/csv";
    case "xml":
      return "application/xml";
    case "yaml":
    case "yml":
      return "application/yaml";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/** Build ACP resource_link for a non-image composer attachment. */
export function promptFileFromAttachment(att: ComposerAttachment): PromptFileAttachment {
  return {
    kind: "resource_link",
    uri: pathToFileUri(att.absolutePath),
    name: att.name,
    mimeType: mimeTypeFromPath(att.absolutePath),
  };
}

/** Parse data URL → ACP image fields; returns null if not a vision MIME. */
export function promptImageFromDataUrl(
  dataUrl: string,
  name: string,
  absolutePath?: string,
): PromptImageAttachment | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  if (!VISION_IMAGE_MIME.has(mimeType)) return null;
  return {
    mimeType,
    data: m[2],
    name,
    uri: absolutePath ? pathToFileUri(absolutePath) : undefined,
  };
}

/** Build ACP image payload from a composer attachment (uses preview or disk read). */
export async function promptImageFromAttachment(
  att: ComposerAttachment,
): Promise<PromptImageAttachment | null> {
  if (!isVisionImagePath(att.absolutePath)) return null;
  if (att.previewUrl) {
    const fromPreview = promptImageFromDataUrl(att.previewUrl, att.name, att.absolutePath);
    if (fromPreview) return fromPreview;
  }
  try {
    const { dataUrl } = await fsDesktop.fsReadImage(att.absolutePath);
    return dataUrl ? promptImageFromDataUrl(dataUrl, att.name, att.absolutePath) : null;
  } catch {
    return null;
  }
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

export function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

/** Split OS drop/paste paths: images stay on the strip; everything else is an inline chip. */
export function partitionComposerDropPaths(paths: string[]): {
  imagePaths: string[];
  filePaths: string[];
} {
  const imagePaths: string[] = [];
  const filePaths: string[] = [];
  for (const path of paths) {
    if (isImagePath(path)) imagePaths.push(path);
    else filePaths.push(path);
  }
  return { imagePaths, filePaths };
}

export function isComposerStripAttachment(att: ComposerAttachment): boolean {
  return att.kind === "image" || isImagePath(att.absolutePath);
}

/** External / dialog / paste / drop attachment shown above the composer input. */
export interface ComposerAttachment {
  id: string;
  fileId: string;
  absolutePath: string;
  /** Project-relative when in-project; otherwise basename or absolute. */
  displayPath: string;
  name: string;
  kind: "image" | "file";
  /** data: URL for image thumbnails in the strip / user bubble. */
  previewUrl?: string;
  /** Optional UI status note shown after send (e.g. vision fallback used). */
  note?: string;
}

function attachmentId(): string {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function projectFileToAttachment(file: ProjectFile): Promise<ComposerAttachment> {
  const kind = isImagePath(file.absolutePath) ? "image" : "file";
  let previewUrl: string | undefined;
  if (kind === "image") {
    try {
      const { dataUrl } = await fsDesktop.fsReadImage(file.absolutePath);
      if (dataUrl) previewUrl = dataUrl;
    } catch {
      // thumb optional
    }
  }
  return {
    id: attachmentId(),
    fileId: file.id,
    absolutePath: file.absolutePath,
    displayPath: file.relativePath || file.name,
    name: file.name,
    kind,
    previewUrl,
  };
}

/** Register OS paths (dialog / paste / drop) into the document store, then attach. */
export async function attachmentsFromAbsolutePaths(
  paths: string[],
  opts?: { imagesOnly?: boolean },
): Promise<ComposerAttachment[]> {
  const store = useDocumentStore.getState();
  const out: ComposerAttachment[] = [];
  for (const absPath of paths) {
    if (opts?.imagesOnly && !isImagePath(absPath)) continue;
    const inProject = store.files.find((f) => f.absolutePath === absPath);
    const file = inProject ?? store.registerExternalFile(absPath);
    out.push(await projectFileToAttachment(file));
  }
  return out;
}

/** Pick file(s) via dialog and register project/external entries. */
export async function pickComposerAttachments(opts?: {
  imagesOnly?: boolean;
}): Promise<ProjectFile[]> {
  const result = await dialogDesktop.dialogOpenFile();
  if (result.canceled || result.paths.length === 0) return [];

  const store = useDocumentStore.getState();
  const attached: ProjectFile[] = [];

  for (const absPath of result.paths) {
    if (opts?.imagesOnly && !isImagePath(absPath)) continue;

    const inProject = store.files.find((f) => f.absolutePath === absPath);
    if (inProject) {
      attached.push(inProject);
      continue;
    }

    attached.push(store.registerExternalFile(absPath));
  }

  return attached;
}

/** Collect absolute paths from a ClipboardEvent or DataTransfer. */
export function absolutePathsFromDataTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const paths: string[] = [];
  if (dt.files?.length) {
    for (const file of Array.from(dt.files)) {
      const p = fsDesktop.getPathForFile(file);
      if (typeof p === "string" && p.trim()) paths.push(p);
    }
  }
  return paths;
}

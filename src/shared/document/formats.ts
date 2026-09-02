/**
 * Extensions `document-read` / Composer @ attachments convert via AnyDoc.
 * Pure shared — no Node / Electron / React.
 */
import { fileExtensionLower } from "../platform/project-file-openability";

/** Dotted lowercase extensions AnyDoc converts locally (P0 whitelist). */
export const DOCUMENT_READ_EXTENSIONS = [
  ".doc",
  ".docx",
  ".docm",
  ".ppt",
  ".pps",
  ".pot",
  ".pptx",
  ".pptm",
  ".ppsx",
  ".ppsm",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xlsb",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".epub",
  ".csv",
  ".pdf",
] as const;

export type DocumentReadExtension = (typeof DOCUMENT_READ_EXTENSIONS)[number];

const DOCUMENT_READ_EXTENSION_SET = new Set<string>(DOCUMENT_READ_EXTENSIONS);

export function isDocumentReadExtension(path: string): boolean {
  return DOCUMENT_READ_EXTENSION_SET.has(fileExtensionLower(path));
}

/** Widget / attachment label, e.g. `DOCX`, `PDF`. */
export function documentReadFormatLabel(path: string): string {
  const ext = fileExtensionLower(path).replace(/^\./, "");
  return ext ? ext.toUpperCase() : "DOCUMENT";
}

/** AnyDoc-ish format id from the path extension (`docx`, `pptx`, `pdf`). */
export function documentReadFormatId(path: string): string {
  const ext = fileExtensionLower(path).replace(/^\./, "");
  return ext || "unknown";
}

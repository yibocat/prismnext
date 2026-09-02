import {
  DOCUMENT_READ_EXTENSIONS,
  documentReadFormatId,
  documentReadFormatLabel,
  isDocumentReadExtension,
} from "../../../shared/document/formats";
import { documentReadError, type DocumentReadError } from "./errors";
import { DOCUMENT_READ_MAX_INPUT_BYTES } from "./map";

export {
  DOCUMENT_READ_EXTENSIONS,
  documentReadFormatId,
  documentReadFormatLabel,
  isDocumentReadExtension,
};

export function assertReadableExtension(filePath: string): { ok: true } | DocumentReadError {
  if (isDocumentReadExtension(filePath)) return { ok: true };
  return documentReadError(
    "unsupported_format",
    `Unsupported format for "${filePath}". Use document-read for Office, OpenDocument, RTF, EPUB, CSV, or PDF.`,
  );
}

export function assertReadableSize(size: number): { ok: true } | DocumentReadError {
  if (size <= DOCUMENT_READ_MAX_INPUT_BYTES) return { ok: true };
  const mb = Math.round(DOCUMENT_READ_MAX_INPUT_BYTES / (1024 * 1024));
  return documentReadError(
    "file_too_large",
    `File is larger than ${mb} MB. Split it or convert a smaller copy.`,
  );
}

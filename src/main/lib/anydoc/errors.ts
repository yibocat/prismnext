export type DocumentReadErrorCode =
  | "missing_path"
  | "file_not_found"
  | "path_outside_project"
  | "unsupported_format"
  | "file_too_large"
  | "anydoc_unavailable"
  | "password_protected"
  | "scanned_pdf_unsupported"
  | "anydoc_convert_failed";

export type DocumentReadError = {
  ok: false;
  error: DocumentReadErrorCode;
  message: string;
};

function messageFromUnknown(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message.trim();
  }
  return String(err);
}

function codeFromUnknown(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : undefined;
}

const PASSWORD_HINT = "This file is password-protected. Save an unlocked copy and try again.";
const SCANNED_HINT =
  "This PDF looks scanned (needs OCR). Add it to the project literature library and use literature-read-pdf, or provide a text version.";
const UNAVAILABLE_HINT =
  "Document conversion is unavailable on this install (AnyDoc native module failed to load).";

export function anydocUnavailableError(detail?: string): DocumentReadError {
  const extra = detail?.trim();
  return {
    ok: false,
    error: "anydoc_unavailable",
    message: extra ? `${UNAVAILABLE_HINT} ${extra}` : UNAVAILABLE_HINT,
  };
}

export function documentReadError(
  error: DocumentReadErrorCode,
  message: string,
): DocumentReadError {
  return { ok: false, error, message };
}

/**
 * Map `@firecrawl/anydoc` rejections (`error.code`) plus message heuristics.
 */
export function mapConvertError(err: unknown): DocumentReadError {
  const code = codeFromUnknown(err);
  const message = messageFromUnknown(err);

  if (code === "encrypted") {
    return { ok: false, error: "password_protected", message: PASSWORD_HINT };
  }
  if (code === "needsOcr") {
    return { ok: false, error: "scanned_pdf_unsupported", message: SCANNED_HINT };
  }
  if (code === "io") {
    if (/no such file|enoent/i.test(message)) {
      return { ok: false, error: "file_not_found", message: "File not found." };
    }
    return {
      ok: false,
      error: "anydoc_convert_failed",
      message: message || "Could not read the file.",
    };
  }
  if (code === "unsupported") {
    return {
      ok: false,
      error: "unsupported_format",
      message: message || "This file format is not supported.",
    };
  }

  if (/password|encrypted|decrypt/i.test(message)) {
    return { ok: false, error: "password_protected", message: PASSWORD_HINT };
  }
  if (/need\s*ocr|scanned|image-only/i.test(message)) {
    return { ok: false, error: "scanned_pdf_unsupported", message: SCANNED_HINT };
  }
  if (/cannot find native binding|failed to load native/i.test(message)) {
    return anydocUnavailableError(message);
  }

  return {
    ok: false,
    error: "anydoc_convert_failed",
    message: message || "Document conversion failed.",
  };
}

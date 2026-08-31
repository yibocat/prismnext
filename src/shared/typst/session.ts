export type TypstRelPath = string;

export type TypstEnsureSessionArgs = {
  projectRoot: string;
};

export type TypstDidOpenArgs = {
  projectRoot: string;
  relPath: TypstRelPath;
  version: number;
  text: string;
  languageId?: "typst";
};

export type TypstDidChangeArgs = TypstDidOpenArgs;

export type TypstDidCloseArgs = {
  projectRoot: string;
  relPath: TypstRelPath;
};

export type TypstPreviewStartArgs = {
  projectRoot: string;
  compileRoot: TypstRelPath;
};

export type TypstPreviewStopArgs = TypstPreviewStartArgs;

export type TypstPreviewReadyEvent = {
  projectRoot: string;
  compileRoot: TypstRelPath;
  previewUrl: string;
  taskId: string;
  /** Host loopback port for the static preview page. Laptop may rewrite `previewUrl`. */
  staticServerPort?: number;
  /** Host data-plane port. Equal to static on tinymist 0.15.2; if not, SSH must bind the same number locally. */
  dataPlanePort?: number;
};

export function isTypstIpcError(value: unknown): value is TypstIpcError {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.error !== "string" || rec.error.length === 0) return false;
  return typeof rec.previewUrl !== "string";
}

export function isTypstPreviewReadyEvent(value: unknown): value is TypstPreviewReadyEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.previewUrl === "string"
    && rec.previewUrl.length > 0
    && typeof rec.projectRoot === "string"
    && typeof rec.compileRoot === "string";
}

export type TypstScrollToEvent = {
  projectRoot: string;
  relPath: TypstRelPath;
  line: number;
  character?: number;
};

export type TypstDiagnosticItem = {
  relPath: TypstRelPath;
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  character?: number;
};

export type TypstDiagnosticsEvent = {
  projectRoot: string;
  compileRoot: TypstRelPath;
  items: TypstDiagnosticItem[];
};

export type TypstIpcError = {
  error: string;
};

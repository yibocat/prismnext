/**
 * Chat artifact PDF specialization — first-page peek in the reply bubble;
 * click opens a dialog using the shared PdfDocumentView (same pdfjs stack).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon, FileTextIcon, FolderOpenIcon, XIcon } from "lucide-react";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { PdfDocumentView } from "@/components/modules/preview";
import { PDFJS_DOCUMENT_OPTIONS } from "@/components/modules/preview/pdf-config";
import { openArtifactPathInFiles } from "@/modes/experiments-mode/experiments-artifact-nav";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { literatureDesktop } from "@/lib/desktop-api/literature";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import {
  artifactBasename,
  chatImagePathCandidates,
} from "../../../shared/interaction/artifact-path";
import { cn } from "@/lib/utils";
import {
  CHAT_ARTIFACT_INLINE_IMAGE_CLASS,
  CHAT_ARTIFACT_PEEK_BODY_CLASS,
  CHAT_ARTIFACT_THUMB_PREVIEW_CLASS,
  CHAT_ARTIFACT_THUMB_SHELL_CLASS,
  normalizeArtifactDisplayPath,
} from "./chat-artifact";

/** Wider raster so full-width chat peeks stay sharp. */
const PEEK_MAX_WIDTH = 960;

async function resolveArtifactAbsPath(
  projectRoot: string,
  src: string,
  workspaceHints: string[],
): Promise<string | null> {
  const candidates = chatImagePathCandidates(src, workspaceHints);
  for (const rel of candidates) {
    const abs = rel.replace(/\\/g, "/").startsWith("library/")
      ? await literatureDesktop.literatureResolveAbs(projectRoot, rel)
      : resolveProjectRelativePath(projectRoot, rel);
    if (!abs) continue;
    try {
      if (await fsDesktop.fsExists(abs)) return abs;
    } catch {
      // try next
    }
  }
  const base = artifactBasename(src);
  if (!base) return null;
  try {
    const found = await fsDesktop.fsFindByBasename(projectRoot, base);
    if (!found) return null;
    return resolveProjectRelativePath(projectRoot, found);
  } catch {
    return null;
  }
}

/** Render page 1 to a PNG data URL for the inline peek. */
export async function renderPdfFirstPageDataUrl(
  bytes: Uint8Array,
  maxWidth = PEEK_MAX_WIDTH,
): Promise<string | null> {
  const doc = await getDocument({
    data: bytes.slice(),
    ...PDFJS_DOCUMENT_OPTIONS,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.25, maxWidth / Math.max(1, base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL("image/png");
  } finally {
    await doc.destroy();
  }
}

function ArtifactActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {children}
      </button>
    </Hint>
  );
}

export function ChatArtifactPdf({
  path,
  title,
  embedded = false,
}: {
  path: string;
  title?: string;
  /** Peek only — no PDF header. Used inside an Interaction card. */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const workspaceHintsKey = useExperimentStore((s) => {
    const hints = new Set<string>();
    const detailWs = s.detail?.meta.workspacePath;
    if (detailWs) hints.add(detailWs);
    for (const e of s.experiments) {
      if (e.workspacePath) hints.add(e.workspacePath);
    }
    return [...hints].join("\n");
  });

  const rel = normalizeArtifactDisplayPath(path);
  const label = (title || artifactBasename(rel) || rel).trim();
  const [peekUrl, setPeekUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadedAbsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rel || !projectRoot) {
      setPeekUrl(null);
      setPdfBytes(null);
      setFailed(false);
      loadedAbsRef.current = null;
      return;
    }
    let cancelled = false;
    const hints = workspaceHintsKey ? workspaceHintsKey.split("\n") : [];

    void (async () => {
      try {
        const abs = await resolveArtifactAbsPath(projectRoot, rel, hints);
        if (cancelled || !abs) {
          if (!cancelled) {
            setFailed(true);
            setPeekUrl(null);
            setPdfBytes(null);
          }
          return;
        }
        const { bytes } = await fsDesktop.fsReadBytes(abs);
        if (cancelled) return;
        const u8 = new Uint8Array(bytes);
        loadedAbsRef.current = abs;
        setPdfBytes(u8);
        const url = await renderPdfFirstPageDataUrl(u8);
        if (cancelled) return;
        if (url) {
          setPeekUrl(url);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setPeekUrl(null);
          setPdfBytes(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rel, projectRoot, workspaceHintsKey]);

  const openFiles = useCallback(() => {
    void openArtifactPathInFiles(rel);
  }, [rel]);

  const copyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rel);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [rel]);

  const openLabel = t("chat.artifact.openInFiles", { defaultValue: "Open in Files" });
  const copyLabel = copied
    ? t("chat.artifact.copied", { defaultValue: "Copied" })
    : t("chat.artifact.copyPath", { defaultValue: "Copy path" });

  if (failed && !peekUrl) {
    if (embedded) {
      return (
        <div
          className={cn(
            CHAT_ARTIFACT_PEEK_BODY_CLASS,
            "flex w-full items-center justify-center py-6 text-[length:var(--font-size-11)] text-muted-foreground",
          )}
        >
          {t("chat.artifact.pdfUnavailable", { defaultValue: "PDF unavailable" })}
        </div>
      );
    }
    return (
      <div className="my-2 flex w-full max-w-full items-stretch gap-2 rounded-lg border border-border-subtle bg-muted/20 p-1.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground">
          <FileTextIcon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="truncate text-[length:var(--font-chat-message)] font-medium">
            {label}
          </div>
          <div className="truncate font-mono text-[length:var(--font-size-11)] text-muted-foreground">
            {t("chat.artifact.pdfUnavailable", { defaultValue: "PDF unavailable" })}
            {" · "}
            {rel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 self-center pr-0.5">
          <ArtifactActionButton label={openLabel} onClick={openFiles}>
            <FolderOpenIcon className="size-3.5" aria-hidden />
          </ArtifactActionButton>
        </div>
      </div>
    );
  }

  const peekImage = peekUrl ? (
    <img
      src={peekUrl}
      alt={label}
      className={CHAT_ARTIFACT_INLINE_IMAGE_CLASS}
      loading="lazy"
    />
  ) : (
    <div
      className={cn(
        CHAT_ARTIFACT_THUMB_PREVIEW_CLASS,
        embedded ? "" : "border-t border-border-subtle",
        "text-[length:var(--font-size-11)] text-muted-foreground",
      )}
    >
      {t("chat.artifact.pdfLoading", { defaultValue: "Loading PDF…" })}
    </div>
  );

  if (embedded) {
    return <div className={CHAT_ARTIFACT_PEEK_BODY_CLASS}>{peekImage}</div>;
  }

  return (
    <>
      <div className={CHAT_ARTIFACT_THUMB_SHELL_CLASS}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="shrink-0 text-[length:var(--font-size-11)] font-medium text-muted-foreground">
            PDF
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[length:var(--font-size-12)] font-medium text-foreground">
              {label}
            </div>
            <div className="truncate font-mono text-[length:var(--font-size-11)] text-muted-foreground">
              {rel}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <ArtifactActionButton label={openLabel} onClick={openFiles}>
              <FolderOpenIcon className="size-3.5" aria-hidden />
            </ArtifactActionButton>
            <ArtifactActionButton label={copyLabel} onClick={() => void copyPath()}>
              <CopyIcon className="size-3.5" aria-hidden />
            </ArtifactActionButton>
          </div>
        </div>

        {peekUrl ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            aria-label={t("chat.artifact.previewPdf", {
              name: label,
              defaultValue: "Preview {{name}}",
            })}
            className={cn(
              CHAT_ARTIFACT_PEEK_BODY_CLASS,
              "block w-full cursor-zoom-in text-left transition-opacity hover:opacity-90",
            )}
          >
            {peekImage}
          </button>
        ) : (
          peekImage
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex h-[min(94vh,56rem)] w-[min(96vw,90rem)] max-w-[min(96vw,90rem)] flex-col gap-0 overflow-hidden border-border-subtle bg-background p-0 shadow-2xl",
            "sm:max-w-[min(96vw,90rem)]",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">
            {label || t("chat.artifact.pdfPreview", { defaultValue: "PDF preview" })}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("common.close")}
              className="absolute top-3 right-3 z-20 shadow-sm"
            >
              <XIcon />
            </Button>
          </DialogClose>
          <div className="min-h-0 flex-1">
            {previewOpen && pdfBytes ? (
              <PdfDocumentView
                key={
                  loadedAbsRef.current
                    ? `chat-artifact-pdf::${loadedAbsRef.current}`
                    : "chat-artifact-pdf"
                }
                source={pdfBytes}
                isPdfFile
                hideToolbar
                persistKey={
                  loadedAbsRef.current
                    ? `chat-artifact-pdf::${loadedAbsRef.current}`
                    : undefined
                }
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

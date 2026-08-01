import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import { cn } from "@/lib/utils";
import { ChatImagePreviewDialog } from "@/lib/markdown/chat-image-preview";
import { chatImagePathCandidates, artifactBasename } from "../../../shared/artifact-path";
import {
  CHAT_ARTIFACT_THUMB_IMAGE_CLASS,
  CHAT_ARTIFACT_THUMB_PREVIEW_CLASS,
  CHAT_ARTIFACT_THUMB_SHELL_CLASS,
} from "./chat-artifact";

/** Resolve `images/foo.png` relative to an extract markdown file path. */
export function resolveExtractRelativeAssetPath(
  mdRelativePath: string,
  assetSrc: string,
): string | null {
  if (!mdRelativePath || !assetSrc) return null;
  if (/^(https?:|data:|file:|blob:)/i.test(assetSrc.trim())) return null;

  const mdDir = mdRelativePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
  const norm = assetSrc.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (norm.startsWith("/") || norm.includes("..")) return null;

  return mdDir ? `${mdDir}/${norm}` : norm;
}

/**
 * Resolve a local markdown image for any project document (extract, notes, …).
 * - `.prismnext/…` → project-root relative (notes that embed extract figures)
 * - otherwise → relative to the markdown file (MinerU `images/` next to extract md)
 */
export function resolveDocumentMarkdownImageRel(
  mdRelativePath: string,
  assetSrc: string,
): string | null {
  if (!assetSrc) return null;
  if (/^(https?:|data:|file:|blob:)/i.test(assetSrc.trim())) return null;

  const norm = assetSrc.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (norm.startsWith("/") || norm.includes("..")) return null;
  if (norm.startsWith(".prismnext/")) return norm;

  return resolveExtractRelativeAssetPath(mdRelativePath, assetSrc);
}

export function ExtractMarkdownImage({
  src,
  alt,
  mdFilePath,
}: {
  src?: string;
  alt?: string;
  mdFilePath: string;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src || !projectRoot) {
      setDataUrl(null);
      return;
    }
    const rel = resolveDocumentMarkdownImageRel(mdFilePath, src);
    if (!rel) {
      setDataUrl(null);
      return;
    }
    const abs = resolveProjectRelativePath(projectRoot, rel);
    if (!abs) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    void window.electronAPI
      .fsReadImage(abs)
      .then(({ dataUrl: url }) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src, mdFilePath, projectRoot]);

  if (!src) return null;
  if (!dataUrl) {
    return (
      <span className="my-2 block text-[length:var(--font-size-12)] text-muted-foreground">
        [Image unavailable: {alt?.trim() || src}]
      </span>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt ?? ""}
      className="my-2 max-w-full h-auto rounded border border-border-subtle"
      loading="lazy"
    />
  );
}

/**
 * Inline image in an agent chat reply. `src` is preferably project-relative;
 * when the agent only wrote a basename or lab-relative path, we try candidates
 * against known experiment workspaces; missing candidates fall back to a
 * project-wide basename search (no hardcoded folder names).
 */
export function ChatProjectImage({
  src,
  alt,
  variant = "inline",
}: {
  src?: string;
  alt?: string;
  /** `inline` = chat embed with zoom; `panel` = fill Interaction / preview viewport. */
  variant?: "inline" | "panel";
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
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const loadedAbsRef = useRef<string | null>(null);
  const loadedMtimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!src || !projectRoot) {
      setDataUrl(null);
      loadedAbsRef.current = null;
      loadedMtimeRef.current = null;
      return;
    }
    // Leave absolute URLs to the browser.
    if (/^(https?:|data:|blob:)/i.test(src.trim())) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    const workspaceHints = workspaceHintsKey ? workspaceHintsKey.split("\n") : [];
    const candidates = chatImagePathCandidates(src, workspaceHints);

    const tryRead = async (rel: string): Promise<{ url: string; abs: string; mtimeMs: number } | null> => {
      const abs = resolveProjectRelativePath(projectRoot, rel);
      if (!abs) return null;
      try {
        const exists = await window.electronAPI.fsExists(abs);
        if (!exists) return null;
        const { dataUrl: url, mtimeMs } = await window.electronAPI.fsReadImage(abs);
        if (!url) return null;
        return { url, abs, mtimeMs: typeof mtimeMs === "number" ? mtimeMs : 0 };
      } catch {
        return null;
      }
    };

    const load = async () => {
      for (const rel of candidates) {
        if (cancelled) return;
        const hit = await tryRead(rel);
        if (hit && !cancelled) {
          loadedAbsRef.current = hit.abs;
          loadedMtimeRef.current = hit.mtimeMs;
          setDataUrl(hit.url);
          return;
        }
      }
      const base = artifactBasename(src);
      if (base && !cancelled) {
        try {
          const found = await window.electronAPI.fsFindByBasename(projectRoot, base);
          if (found && !cancelled) {
            const hit = await tryRead(found);
            if (hit && !cancelled) {
              loadedAbsRef.current = hit.abs;
              loadedMtimeRef.current = hit.mtimeMs;
              setDataUrl(hit.url);
              return;
            }
          }
        } catch {
          // fall through
        }
      }
      if (!cancelled) {
        loadedAbsRef.current = null;
        loadedMtimeRef.current = null;
        setDataUrl(null);
      }
    };

    const refreshIfChanged = async () => {
      const abs = loadedAbsRef.current;
      if (!abs || cancelled) return;
      try {
        const st = await window.electronAPI.fsStat(abs);
        if (!st || cancelled) return;
        if (loadedMtimeRef.current != null && st.mtimeMs === loadedMtimeRef.current) return;
        const { dataUrl: url, mtimeMs } = await window.electronAPI.fsReadImage(abs);
        if (url && !cancelled) {
          loadedMtimeRef.current = typeof mtimeMs === "number" ? mtimeMs : st.mtimeMs;
          setDataUrl(url);
        }
      } catch {
        // ignore
      }
    };

    void load();

    const onVis = () => {
      if (document.visibilityState === "visible") void refreshIfChanged();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(() => {
      void refreshIfChanged();
    }, 2500);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, [src, projectRoot, workspaceHintsKey]);

  if (!src) return null;
  if (!dataUrl) {
    const unavailable = (
      <span className="text-[length:var(--font-size-12)] text-muted-foreground">
        [Image unavailable: {alt?.trim() || src}]
      </span>
    );
    if (variant === "panel") {
      return (
        <div className="flex h-full min-h-0 w-full items-center justify-center px-4 text-center">
          {unavailable}
        </div>
      );
    }
    return <span className="my-2 block">{unavailable}</span>;
  }

  const previewName = alt?.trim() || artifactBasename(src) || t("chat.composer.imagePreview");

  if (variant === "panel") {
    return (
      <img
        src={dataUrl}
        alt={alt ?? ""}
        className="block h-full w-full min-h-0 object-contain object-center"
        loading="lazy"
      />
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("chat.composer.previewAttachment", { name: previewName })}
        onClick={() => setPreviewOpen(true)}
        className={cn(
          CHAT_ARTIFACT_THUMB_SHELL_CLASS,
          "cursor-zoom-in p-1.5 text-left transition-opacity hover:opacity-90",
        )}
      >
        <div className={CHAT_ARTIFACT_THUMB_PREVIEW_CLASS}>
          <img
            src={dataUrl}
            alt={alt ?? ""}
            className={CHAT_ARTIFACT_THUMB_IMAGE_CLASS}
            loading="lazy"
          />
        </div>
      </button>
      <ChatImagePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={dataUrl}
        name={previewName}
      />
    </>
  );
}

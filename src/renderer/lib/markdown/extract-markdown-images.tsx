import { useEffect, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import { chatImagePathCandidates, artifactBasename } from "../../../shared/artifact-path";

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
    const rel = resolveExtractRelativeAssetPath(mdFilePath, src);
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
      className="my-2 max-w-full h-auto rounded border border-border/40"
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
export function ChatProjectImage({ src, alt }: { src?: string; alt?: string }) {
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

  useEffect(() => {
    if (!src || !projectRoot) {
      setDataUrl(null);
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

    void (async () => {
      const tryRead = async (rel: string): Promise<string | null> => {
        const abs = resolveProjectRelativePath(projectRoot, rel);
        if (!abs) return null;
        try {
          const exists = await window.electronAPI.fsExists(abs);
          if (!exists) return null;
          const { dataUrl: url } = await window.electronAPI.fsReadImage(abs);
          return url ?? null;
        } catch {
          return null;
        }
      };

      for (const rel of candidates) {
        if (cancelled) return;
        const url = await tryRead(rel);
        if (url && !cancelled) {
          setDataUrl(url);
          return;
        }
      }
      const base = artifactBasename(src);
      if (base && !cancelled) {
        try {
          const found = await window.electronAPI.fsFindByBasename(projectRoot, base);
          if (found && !cancelled) {
            const url = await tryRead(found);
            if (url && !cancelled) {
              setDataUrl(url);
              return;
            }
          }
        } catch {
          // fall through
        }
      }
      if (!cancelled) setDataUrl(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [src, projectRoot, workspaceHintsKey]);

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
      className="my-2 max-w-full h-auto rounded border border-border/40"
      loading="lazy"
    />
  );
}

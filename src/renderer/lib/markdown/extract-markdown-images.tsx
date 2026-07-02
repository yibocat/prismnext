import { useEffect, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { resolveProjectRelativePath } from "@/lib/files/project-path";

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

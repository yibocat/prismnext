import { useEffect, useState } from "react";
import type { IconSpec } from "@shared/platform/icon-spec";

/** Join icon base dir + relative filename into an absolute path (POSIX-ish). */
export function resolveIconImageAbsPath(
  baseDir: string | null | undefined,
  filename: string,
): string | null {
  if (!baseDir || !filename) return null;
  const root = baseDir.replace(/[/\\]+$/, "");
  return `${root}/${filename}`;
}

/**
 * Resolve an image IconSpec to a displayable data URL via fsReadImage.
 * `previewSrc` wins when set (local pending pick before persist).
 */
export function useIconImageSrc(
  spec: IconSpec | null | undefined,
  baseDir: string | null | undefined,
  previewSrc?: string | null,
): string | null {
  const [src, setSrc] = useState<string | null>(previewSrc ?? null);

  useEffect(() => {
    if (previewSrc) {
      setSrc(previewSrc);
      return;
    }
    if (spec?.kind !== "image" || !spec.value) {
      setSrc(null);
      return;
    }
    // Legacy inline data URLs (should not be written anymore).
    if (spec.value.startsWith("data:")) {
      setSrc(spec.value);
      return;
    }
    const abs = resolveIconImageAbsPath(baseDir, spec.value);
    if (!abs) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    void window.electronAPI
      .fsReadImage(abs)
      .then((res) => {
        if (!cancelled) setSrc(res?.dataUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spec?.kind, spec?.value, baseDir, previewSrc]);

  return src;
}

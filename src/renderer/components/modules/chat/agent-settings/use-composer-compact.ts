import { useEffect, useState, type RefObject } from "react";

/** Toolbar switches to icon-only controls below this width (px). */
export const COMPOSER_COMPACT_WIDTH = 440;

export function useComposerCompact(ref: RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? el.clientWidth;
      setCompact(width < COMPOSER_COMPACT_WIDTH);
    });
    ro.observe(el);
    setCompact(el.clientWidth < COMPOSER_COMPACT_WIDTH);
    return () => ro.disconnect();
  }, [ref]);

  return compact;
}

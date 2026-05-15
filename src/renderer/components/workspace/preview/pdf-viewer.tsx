import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { MupdfPage } from "./mupdf-page";
import {
  getOrOpenDocument,
  getCachedDocument,
  type DocCacheResult,
} from "@/lib/mupdf/pdf-doc-cache";

interface PdfViewerProps {
  data: Uint8Array;
  scale: number;
  onSynctexClick?: (page: number, x: number, y: number) => void;
  onExternalLink?: (href: string) => void;
  onPageChange?: (page: number, totalPages: number) => void;
}

export function PdfViewer({
  data,
  scale,
  onSynctexClick,
  onExternalLink,
  onPageChange,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [docInfo, setDocInfo] = useState<DocCacheResult | null>(null);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([0]));
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);

  // Track mouse position for zoom-to-cursor
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const prevScaleRef = useRef(scale);

  // Open document
  useEffect(() => {
    const cached = getCachedDocument(data);
    if (cached) {
      setDocInfo(cached);
      return;
    }
    getOrOpenDocument(data).then(setDocInfo);
  }, [data]);

  // Notify parent of page count
  useEffect(() => {
    if (docInfo) {
      onPageChange?.(currentPage + 1, docInfo.pageSizes.length);
    }
  }, [docInfo, currentPage, onPageChange]);

  // Track mouse position relative to scroll container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        inside: true,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.inside = false;
    };

    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    container.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  // Adjust scroll position when scale changes (zoom toward cursor/center)
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const oldScale = prevScaleRef.current;
    if (oldScale === scale || oldScale <= 0) {
      prevScaleRef.current = scale;
      return;
    }

    const ratio = scale / oldScale;
    let anchorX: number, anchorY: number;

    if (mouseRef.current.inside) {
      // Zoom toward cursor
      anchorX = mouseRef.current.x;
      anchorY = mouseRef.current.y;
    } else {
      // Zoom toward viewport center
      anchorX = container.clientWidth / 2;
      anchorY = container.clientHeight / 2;
    }

    const pointX = container.scrollLeft + anchorX;
    const pointY = container.scrollTop + anchorY;

    container.scrollLeft = pointX * ratio - anchorX;
    container.scrollTop = pointY * ratio - anchorY;

    prevScaleRef.current = scale;
  }, [scale]);

  // Intersection observer for lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const newVisible = new Set<number>();
        entries.forEach((entry) => {
          const pageIndex = parseInt(
            (entry.target as HTMLElement).dataset.page || "0",
            10,
          );
          if (entry.isIntersecting) {
            newVisible.add(pageIndex);
          }
        });
        setVisiblePages((prev) => new Set([...prev, ...newVisible]));
      },
      {
        root: container,
        rootMargin: "200% 0px",
        threshold: 0,
      },
    );

    const pages = container.querySelectorAll("[data-page]");
    pages.forEach((page) => observer.observe(page));

    return () => observer.disconnect();
  }, [docInfo]);

  // Track scroll for current page
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scaleRef = { current: scale };

    const handleScroll = () => {
      if (!docInfo) return;

      const scrollTop = container.scrollTop;
      const pageHeight = docInfo.pageSizes[0]?.height || 800;
      const page = Math.floor(scrollTop / (pageHeight * scaleRef.current + 16));
      const newPage = Math.min(page, docInfo.pageSizes.length - 1);

      if (newPage !== currentPageRef.current) {
        currentPageRef.current = newPage;
        setCurrentPage(newPage);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [docInfo, scale]);

  // Handle link click
  const handleLinkClick = useCallback(
    (href: string, isExternal: boolean) => {
      if (isExternal) {
        onExternalLink?.(href);
      } else {
        const match = href.match(/#page=(\d+)/);
        if (match) {
          const targetPage = parseInt(match[1], 10) - 1;
          const container = containerRef.current;
          if (container && docInfo) {
            const pageHeight = docInfo.pageSizes[0]?.height || 800;
            container.scrollTop = targetPage * (pageHeight * scale + 16);
          }
        }
      }
    },
    [onExternalLink, scale, docInfo],
  );

  const handleSynctexClick = useCallback(
    (page: number, x: number, y: number) => {
      onSynctexClick?.(page, x, y);
    },
    [onSynctexClick],
  );

  if (!docInfo) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading PDF...</div>
      </div>
    );
  }

  const { docId, pageSizes } = docInfo;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-muted/30 p-4"
    >
      <div className="mx-auto flex w-fit flex-col items-center gap-4">
        {pageSizes.map((size, pageIndex) => (
          <div
            key={pageIndex}
            data-page={pageIndex}
            className="relative"
          >
            <MupdfPage
              docId={docId}
              pageIndex={pageIndex}
              scale={scale}
              pageSize={size}
              isVisible={visiblePages.has(pageIndex)}
              onLinkClick={handleLinkClick}
              onSynctexClick={handleSynctexClick}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

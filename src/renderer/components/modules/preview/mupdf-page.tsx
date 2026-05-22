import { useEffect, useRef, useCallback, useState } from "react";
import { getMupdfClient } from "@/lib/mupdf/mupdf-client";
import type { PageSize, LinkData } from "@/lib/mupdf/types";

interface MupdfPageProps {
  docId: number;
  pageIndex: number;
  scale: number;
  pageSize: PageSize;
  isVisible: boolean;
  onLinkClick?: (href: string, isExternal: boolean) => void;
  onSynctexClick?: (page: number, x: number, y: number) => void;
}

export function MupdfPage({
  docId,
  pageIndex,
  scale,
  pageSize,
  isVisible,
  onLinkClick,
  onSynctexClick,
}: MupdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [links, setLinks] = useState<LinkData[]>([]);
  const renderVersionRef = useRef(0);
  const lastRenderedScaleRef = useRef(1);
  const [renderedScale, setRenderedScale] = useState(1);

  const width = pageSize.width * scale;
  const height = pageSize.height * scale;

  // The scale at which the canvas was last rendered
  const baseWidth = pageSize.width * renderedScale;
  const baseHeight = pageSize.height * renderedScale;

  // Render page to canvas
  const renderPage = useCallback(async (targetScale: number) => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const client = getMupdfClient();
    const dpi = targetScale * 72 * window.devicePixelRatio;
    const gen = ++renderVersionRef.current;

    try {
      const imageData = await client.drawPage(docId, pageIndex, dpi);

      // Check if this render is still current
      if (gen !== renderVersionRef.current) return;

      canvas.width = imageData.width;
      canvas.height = imageData.height;

      // Use createImageBitmap for better performance
      const bitmap = await createImageBitmap(imageData);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
      }
      bitmap.close();

      lastRenderedScaleRef.current = targetScale;
      setRenderedScale(targetScale);
    } catch (error) {
      console.error(`[mupdf-page] Failed to render page ${pageIndex}:`, error);
    }
  }, [docId, pageIndex, isVisible]);

  // Initial render
  useEffect(() => {
    if (isVisible && renderedScale === 1) {
      renderPage(scale);
    }
  }, [isVisible, scale, renderedScale, renderPage]);

  // Debounced re-render when scale changes significantly
  useEffect(() => {
    if (!isVisible) return;

    const scaleDiff = Math.abs(scale - lastRenderedScaleRef.current);
    // Only re-render if scale changed by more than 20%
    if (scaleDiff / lastRenderedScaleRef.current > 0.2) {
      const timer = setTimeout(() => {
        renderPage(scale);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [scale, isVisible, renderPage]);

  // Fetch links once
  useEffect(() => {
    if (!isVisible || docId <= 0) return;

    const client = getMupdfClient();
    client.getPageLinks(docId, pageIndex)
      .then(setLinks)
      .catch(() => {});
  }, [docId, pageIndex, isVisible]);

  // Handle double-click for SyncTeX
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSynctexClick) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;

      onSynctexClick(pageIndex + 1, x, y);
    },
    [onSynctexClick, pageIndex, scale],
  );

  // Handle link click
  const handleLinkClick = useCallback(
    (e: React.MouseEvent, link: LinkData) => {
      e.preventDefault();
      e.stopPropagation();
      onLinkClick?.(link.href, link.isExternal);
    },
    [onLinkClick],
  );

  // Calculate transform for smooth scaling
  const transformScale = renderedScale > 0 ? scale / renderedScale : 1;

  return (
    <div
      className="relative bg-white shadow-md"
      style={{ width: `${width}px`, height: `${height}px` }}
      onDoubleClick={handleDoubleClick}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 origin-top-left"
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `scale(${transformScale})`,
          transformOrigin: "top left",
        }}
      />

      {/* Link layer */}
      {links.map((link, i) => (
        <a
          key={i}
          href={link.href}
          className="absolute cursor-pointer"
          style={{
            left: `${link.x * scale}px`,
            top: `${link.y * scale}px`,
            width: `${link.w * scale}px`,
            height: `${link.h * scale}px`,
          }}
          onClick={(e) => handleLinkClick(e, link)}
        />
      ))}
    </div>
  );
}

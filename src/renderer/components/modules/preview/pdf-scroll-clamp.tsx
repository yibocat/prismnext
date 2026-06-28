import { useEffect } from "react";
import { usePdf } from "@anaralabs/lector";

/** Keep Lector scroll offsets inside the scaled wrapper (must mount inside `<Root>`). */
export function PdfScrollClamp() {
  const viewportRef = usePdf((s) => s.viewportRef);
  const zoom = usePdf((s) => s.zoom);
  const pdfDocumentProxy = usePdf((s) => s.pdfDocumentProxy);

  useEffect(() => {
    const c = viewportRef.current;
    if (!c || !pdfDocumentProxy) return;
    const id = requestAnimationFrame(() => {
      const wrapper = c.firstElementChild as HTMLElement | null;
      if (!wrapper) return;
      const padStyle = getComputedStyle(c);
      const padX = (parseFloat(padStyle.paddingLeft) || 0) + (parseFloat(padStyle.paddingRight) || 0);
      const padY = (parseFloat(padStyle.paddingTop) || 0) + (parseFloat(padStyle.paddingBottom) || 0);
      const viewW = Math.max(0, c.clientWidth - padX);
      const viewH = Math.max(0, c.clientHeight - padY);
      const contentW = wrapper.offsetWidth || parseFloat(wrapper.style.width) || 0;
      const contentH = wrapper.offsetHeight || parseFloat(wrapper.style.height) || 0;
      const maxLeft = Math.max(0, contentW - viewW);
      const maxTop = Math.max(0, contentH - viewH);
      if (c.scrollLeft > maxLeft) c.scrollLeft = maxLeft;
      if (c.scrollTop > maxTop) c.scrollTop = maxTop;
      if (c.scrollLeft < 0) c.scrollLeft = 0;
      if (c.scrollTop < 0) c.scrollTop = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [zoom, pdfDocumentProxy, viewportRef]);

  return null;
}

import { useCallback, useEffect, useState } from "react";

export function useInlineDeleteConfirm() {
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingId) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(`[data-inline-delete-confirm="${pendingId}"]`)) return;
      setPendingId(null);
    };
    const timerId = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    }, 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [pendingId]);

  const clearPending = useCallback(() => setPendingId(null), []);
  const isPending = useCallback((id: string) => pendingId === id, [pendingId]);

  return { pendingId, setPendingId, clearPending, isPending };
}

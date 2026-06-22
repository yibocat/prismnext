import { useCallback, useState, type RefObject } from "react";

/** Main model list width (matches `w-44`). */
const MENU_WIDTH = 176;
/** Reasoning submenu width (matches `w-28`). */
const SUBMENU_WIDTH = 112;
const VIEWPORT_PADDING = 16;

export type MenuAlign = "start" | "end";

/**
 * Place the model dropdown so model list + reasoning submenu fit in the viewport.
 *
 * - Enough room to the right → align start (menu grows right, submenu flies out right).
 * - Tight on the right → align end (menu grows left, submenu still uses Radix collision flip).
 */
export function useModelMenuPlacement(
  triggerRef: RefObject<HTMLElement | null>,
): {
  menuAlign: MenuAlign;
  refreshPlacement: () => void;
} {
  const [menuAlign, setMenuAlign] = useState<MenuAlign>("start");

  const refreshPlacement = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left - VIEWPORT_PADDING;
    const spaceLeft = rect.right - VIEWPORT_PADDING;
    const combinedWidth = MENU_WIDTH + SUBMENU_WIDTH;

    if (spaceRight >= combinedWidth) {
      setMenuAlign("start");
    } else if (spaceLeft >= combinedWidth) {
      setMenuAlign("end");
    } else {
      // Narrowest: bias menu toward the side with more room
      setMenuAlign(spaceLeft > spaceRight ? "end" : "start");
    }
  }, [triggerRef]);

  return { menuAlign, refreshPlacement };
}

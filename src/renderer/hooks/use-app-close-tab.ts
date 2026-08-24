import { useEffect } from "react";
import { shellDesktop } from "@/lib/desktop-api/shell";
import { closeActiveTabFromShortcut } from "@/lib/workspace/close-active-tab";

/** Wire main-process Cmd+W (application menu) to RightArea → chat → close-window cascade. */
export function useAppCloseTab() {
  useEffect(() => {
    return shellDesktop.onCloseTabRequest(() => {
      const result = closeActiveTabFromShortcut();
      if (result === "close-window") {
        void shellDesktop.windowClose();
      }
    });
  }, []);
}

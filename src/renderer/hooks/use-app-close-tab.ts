import { useEffect } from "react";
import { closeActiveTabFromShortcut } from "@/lib/workspace/close-active-tab";

/** Wire main-process Cmd+W (application menu) to RightArea → chat → close-window cascade. */
export function useAppCloseTab() {
  useEffect(() => {
    return window.electronAPI.onCloseTabRequest(() => {
      const result = closeActiveTabFromShortcut();
      if (result === "close-window") {
        void window.electronAPI.windowClose();
      }
    });
  }, []);
}

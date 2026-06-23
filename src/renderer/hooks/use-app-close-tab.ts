import { useEffect } from "react";
import { closeActiveTabFromShortcut } from "@/lib/workspace/close-active-tab";

/** Wire main-process Cmd+W (application menu) to tab close — never close the window. */
export function useAppCloseTab() {
  useEffect(() => {
    return window.electronAPI.onCloseTabRequest(() => {
      closeActiveTabFromShortcut();
    });
  }, []);
}

import { useState, useEffect } from "react";
import { desktopPlatform, shellDesktop } from "@/lib/desktop-api/shell";

export function useWindowState() {
  const platform = desktopPlatform();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    void shellDesktop.windowIsMaximized().then(setIsMaximized);
    void shellDesktop.windowIsFullscreen().then(setIsFullscreen);

    return shellDesktop.onWindowStateChange((state) => {
      setIsMaximized(state.isMaximized);
      setIsFullscreen(state.isFullscreen);
    });
  }, []);

  return { platform, isMaximized, isFullscreen } as const;
}

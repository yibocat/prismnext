import { useState, useEffect } from "react";

export function useWindowState() {
  const platform = window.electronAPI?.platform ?? "darwin";
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    window.electronAPI?.windowIsMaximized().then(setIsMaximized);
    window.electronAPI?.windowIsFullscreen().then(setIsFullscreen);

    return window.electronAPI?.onWindowStateChange((state) => {
      setIsMaximized(state.isMaximized);
      setIsFullscreen(state.isFullscreen);
    });
  }, []);

  return { platform, isMaximized, isFullscreen } as const;
}

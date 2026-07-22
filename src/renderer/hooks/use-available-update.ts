import { useCallback, useEffect, useState } from "react";
import { mapUpdaterStatus } from "@/lib/updates/map-updater-status";
import type { UpdaterStatus } from "@/types/electron";

export type AvailableUpdateState = {
  /** Latest version string when an update can be installed; null when up-to-date / unavailable. */
  latestVersion: string | null;
  downloading: boolean;
  percent: number;
  busy: boolean;
  /** True when the sidebar update affordance should show. */
  visible: boolean;
  oneClickUpdate: () => Promise<void>;
};

function versionFromStatus(result: UpdaterStatus | null | undefined): string | null {
  const ui = mapUpdaterStatus(result);
  if (
    ui.kind === "available" ||
    ui.kind === "downloaded" ||
    ui.kind === "downloading"
  ) {
    const v = ui.latestVersion?.trim();
    return v || null;
  }
  return null;
}

/**
 * Soft update check for chrome affordances (sidebar). Uses baked default feed.
 */
export function useAvailableUpdate(): AvailableUpdateState {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((result: UpdaterStatus | null | undefined) => {
    const ui = mapUpdaterStatus(result);
    if (ui.kind === "downloading") {
      setDownloading(true);
      setPercent(ui.percent);
      setLatestVersion(ui.latestVersion?.trim() || null);
      return;
    }
    if (ui.kind === "available" || ui.kind === "downloaded") {
      setDownloading(false);
      setPercent(ui.kind === "downloaded" ? 100 : 0);
      setLatestVersion(ui.latestVersion?.trim() || null);
      return;
    }
    setDownloading(false);
    setPercent(0);
    setLatestVersion(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const cached = await window.electronAPI.updateStatus();
        if (!cancelled) apply(cached);
      } catch {
        /* ignore */
      }
      try {
        const fresh = await window.electronAPI.updateCheck();
        if (!cancelled) apply(fresh);
      } catch {
        /* ignore */
      }
    };

    void run();

    const unsub = window.electronAPI.onUpdateProgress(({ percent: p }) => {
      setDownloading(true);
      setPercent(p);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [apply]);

  const oneClickUpdate = useCallback(async () => {
    setBusy(true);
    setDownloading(true);
    try {
      const current = await window.electronAPI.updateStatus();
      let result = current;
      if (current.status !== "downloaded") {
        if (!latestVersion) {
          const v = versionFromStatus(current);
          if (v) setLatestVersion(v);
        }
        result = await window.electronAPI.updateDownload();
        apply(result);
      }
      if (result.status !== "downloaded") {
        setBusy(false);
        return;
      }
      await window.electronAPI.updateInstall();
    } catch {
      setBusy(false);
      setDownloading(false);
    }
  }, [apply, latestVersion]);

  return {
    latestVersion,
    downloading,
    percent,
    busy,
    visible: Boolean(latestVersion) || downloading,
    oneClickUpdate,
  };
}

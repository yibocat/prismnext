import { useCallback, useEffect, useState } from "react";
import { mapUpdaterStatus } from "@/lib/updates/map-updater-status";
import { requestUpdateInstall } from "@/lib/updates/request-update-install";
import type { UpdaterStatus } from "@/types/electron";

export type AvailableUpdateState = {
  /** Latest version string when an update can be installed; null when up-to-date / unavailable. */
  latestVersion: string | null;
  downloading: boolean;
  percent: number;
  busy: boolean;
  /** True when download finished and install can proceed. */
  readyToInstall: boolean;
  /** True when the sidebar update affordance should show. */
  visible: boolean;
  /** Download if needed, then install when ready. */
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
  const [readyToInstall, setReadyToInstall] = useState(false);

  const apply = useCallback((result: UpdaterStatus | null | undefined) => {
    const ui = mapUpdaterStatus(result);
    if (ui.kind === "downloading") {
      setDownloading(true);
      setReadyToInstall(false);
      setPercent(ui.percent);
      setLatestVersion(ui.latestVersion?.trim() || null);
      return;
    }
    if (ui.kind === "downloaded") {
      setDownloading(false);
      setReadyToInstall(true);
      setPercent(100);
      setLatestVersion(ui.latestVersion?.trim() || null);
      return;
    }
    if (ui.kind === "available") {
      setDownloading(false);
      setReadyToInstall(false);
      setPercent(0);
      setLatestVersion(ui.latestVersion?.trim() || null);
      return;
    }
    setDownloading(false);
    setReadyToInstall(false);
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

    const unsubProgress = window.electronAPI.onUpdateProgress(({ percent: p }) => {
      setDownloading(true);
      setReadyToInstall(false);
      setPercent(p);
    });
    const unsubChanged = window.electronAPI.onUpdateChanged((raw) => {
      apply(raw as UpdaterStatus);
    });

    return () => {
      cancelled = true;
      unsubProgress?.();
      unsubChanged?.();
    };
  }, [apply]);

  const oneClickUpdate = useCallback(async () => {
    setBusy(true);
    try {
      const current = await window.electronAPI.updateStatus();
      let result = current;
      if (current.status !== "downloaded") {
        if (!latestVersion) {
          const v = versionFromStatus(current);
          if (v) setLatestVersion(v);
        }
        setDownloading(true);
        result = await window.electronAPI.updateDownload();
        apply(result);
      }
      if (result.status !== "downloaded") {
        setBusy(false);
        return;
      }
      const install = await requestUpdateInstall();
      if (!install.ok) {
        setBusy(false);
        setReadyToInstall(true);
      }
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
    readyToInstall,
    visible: Boolean(latestVersion) || downloading,
    oneClickUpdate,
  };
}

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  CheckCircle2Icon,
  DownloadIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  AlertTriangleIcon,
  RocketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useSettingsStore } from "@/stores/settings-store";
import type { UpdaterStatus } from "@/types/electron";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const CARD = SETTINGS_CARD;
const CATEGORY_HEADER = SETTINGS_CATEGORY_HEADER;
const ROW_LABEL = SETTINGS_ROW_LABEL;
const ROW_DESC = SETTINGS_ROW_DESC;

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date"; currentVersion: string }
  | {
      kind: "available";
      currentVersion: string;
      latestVersion: string;
      releaseNotes?: string;
      downloadPath?: string;
    }
  | {
      kind: "ignored";
      currentVersion: string;
      latestVersion: string;
      downloadPath?: string;
    }
  | {
      kind: "downloading";
      currentVersion: string;
      latestVersion?: string;
      percent: number;
      downloadPath?: string;
    }
  | {
      kind: "downloaded";
      currentVersion: string;
      latestVersion?: string;
      downloadPath?: string;
    }
  | { kind: "error"; message: string; downloadPath?: string }
  | { kind: "no-source" };

type OpencodeInfo = {
  available: boolean;
  version: string | null;
  error?: string;
};

function fromUpdaterStatus(result: UpdaterStatus | null | undefined): Status {
  if (!result || result.status === "idle") return { kind: "idle" };
  switch (result.status) {
    case "checking":
      return { kind: "checking" };
    case "up-to-date":
      return { kind: "up-to-date", currentVersion: result.currentVersion };
    case "available":
      return {
        kind: "available",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion ?? result.latest?.version ?? "",
        releaseNotes: result.releaseNotes ?? result.latest?.releaseNotes,
        downloadPath: result.latest?.path,
      };
    case "ignored":
      return {
        kind: "ignored",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion ?? result.latest?.version ?? "",
        downloadPath: result.latest?.path,
      };
    case "downloading":
      return {
        kind: "downloading",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        percent: result.progress?.percent ?? 0,
        downloadPath: result.latest?.path,
      };
    case "downloaded":
      return {
        kind: "downloaded",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        downloadPath: result.latest?.path,
      };
    case "error":
      return {
        kind: "error",
        message: result.error ?? "Unknown error",
        downloadPath: result.latest?.path,
      };
    case "no-source":
      return { kind: "no-source" };
    default:
      return { kind: "idle" };
  }
}

function formatOpencodeVersion(info: OpencodeInfo, t: TFunction): string {
  if (!info.available) return t("settings.about.notFound");
  if (info.version) return info.version;
  return info.error ? t("common.unavailable") : "—";
}

function openExternal(url: string): void {
  window.electronAPI.shellOpenExternal(url).catch(() => {
    /* user dismissed or URL blocked */
  });
}

export function AboutSettings() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsStore();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [appVersion, setAppVersion] = useState<string>("—");
  const [opencodeInfo, setOpencodeInfo] = useState<OpencodeInfo | null>(null);
  const [sourceDraft, setSourceDraft] = useState(settings.updateSource ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  // On mount: surface any previously-cached check result without a network call.
  useEffect(() => {
    window.electronAPI
      .updateStatus()
      .then((r) => setStatus(fromUpdaterStatus(r)))
      .catch(() => setStatus({ kind: "idle" }));
  }, []);

  useEffect(() => {
    window.electronAPI
      .aboutGetVersions()
      .then((info) => {
        setAppVersion(info.appVersion || "—");
        setOpencodeInfo(info.opencode);
      })
      .catch(() => {
        setAppVersion("—");
        setOpencodeInfo(null);
      });
  }, []);

  // Keep the input in sync if settings change elsewhere.
  useEffect(() => {
    setSourceDraft(settings.updateSource ?? "");
  }, [settings.updateSource]);

  // Live download percent from main.
  useEffect(() => {
    return window.electronAPI.onUpdateProgress(({ percent }) => {
      setStatus((prev) => {
        if (prev.kind !== "downloading" && prev.kind !== "available") return prev;
        return {
          kind: "downloading",
          currentVersion: prev.currentVersion,
          latestVersion: "latestVersion" in prev ? prev.latestVersion : undefined,
          percent,
          downloadPath: "downloadPath" in prev ? prev.downloadPath : undefined,
        };
      });
    });
  }, []);

  const doCheck = useCallback(async () => {
    setStatus({ kind: "checking" });
    try {
      const result = await window.electronAPI.updateCheck();
      setStatus(fromUpdaterStatus(result));
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const saveSource = useCallback(async () => {
    await updateSettings({ updateSource: sourceDraft.trim() || undefined });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [sourceDraft, updateSettings]);

  const ignoreVersion = useCallback(async () => {
    if (status.kind !== "available") return;
    const result = await window.electronAPI.updateIgnore(status.latestVersion);
    setStatus(fromUpdaterStatus(result));
  }, [status]);

  const unignoreVersion = useCallback(async () => {
    const result = await window.electronAPI.updateUnignore();
    setStatus(fromUpdaterStatus(result));
  }, []);

  const onDownloadInApp = useCallback(async () => {
    setBusy(true);
    setStatus((prev) => {
      if (prev.kind !== "available" && prev.kind !== "ignored") return prev;
      return {
        kind: "downloading",
        currentVersion: prev.currentVersion,
        latestVersion: prev.latestVersion,
        percent: 0,
        downloadPath: prev.downloadPath,
      };
    });
    try {
      const result = await window.electronAPI.updateDownload();
      setStatus(fromUpdaterStatus(result));
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const onInstall = useCallback(async () => {
    setBusy(true);
    try {
      await window.electronAPI.updateInstall();
    } catch (err) {
      setBusy(false);
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const downloadPath =
    status.kind === "available" ||
    status.kind === "ignored" ||
    status.kind === "downloading" ||
    status.kind === "downloaded" ||
    status.kind === "error"
      ? status.downloadPath
      : undefined;

  const onOpenDownloadPage = useCallback(() => {
    if (!downloadPath) return;
    openExternal(downloadPath);
  }, [downloadPath]);

  // Prefer AboutVersions; fall back to update-check payload when present.
  const displayAppVersion =
    appVersion !== "—"
      ? appVersion
      : "currentVersion" in status
        ? status.currentVersion
        : "—";

  const opencodeVersion = opencodeInfo ? formatOpencodeVersion(opencodeInfo, t) : "—";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        {/* ── Header ── */}
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.about.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.about.subtitle")}
          </p>
        </div>

        {/* ── Version ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.about.version")}</h3>
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>{t("settings.about.appName")}</p>
                <p className={ROW_DESC}>{t("settings.about.appDesc")}</p>
              </div>
              <span className="font-mono text-[length:var(--font-size-13)] text-muted-foreground shrink-0">
                {displayAppVersion}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 border-t border-border/60">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>{t("settings.about.opencode")}</p>
                <p className={ROW_DESC}>{t("settings.about.opencodeDesc")}</p>
              </div>
              <span className="font-mono text-[length:var(--font-size-13)] text-muted-foreground shrink-0">
                {opencodeVersion}
              </span>
            </div>
          </div>
        </div>

        {/* ── Update source ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.about.updateSource")}</h3>
          <div className={CARD}>
            <div className="px-1 py-3 space-y-3">
              <div className="px-1">
                <p className={ROW_LABEL}>{t("settings.about.manifestLabel")}</p>
                <p className={ROW_DESC + " mb-2"}>{t("settings.about.manifestDesc")}</p>
                <div className="flex gap-2">
                  <Input
                    value={sourceDraft}
                    onChange={(e) => setSourceDraft(e.target.value)}
                    placeholder={t("settings.about.manifestPlaceholder")}
                    className="font-mono text-[length:var(--font-size-12)]"
                  />
                  <Button variant="outline" size="sm" onClick={saveSource} className="shrink-0">
                    {savedFlash ? t("common.saved") : t("common.save")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Check for updates ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.about.checkForUpdates")}</h3>
          <div className={CARD}>
            <div className="px-1 py-3 space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="min-w-0 flex-1 pr-4">
                  <p className={ROW_LABEL}>
                    {status.kind === "checking" ? t("common.loading") : t("settings.about.checkNow")}
                  </p>
                  <p className={ROW_DESC}>{t("settings.about.checkDesc")}</p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={doCheck}
                  disabled={status.kind === "checking" || status.kind === "downloading" || busy}
                  className="shrink-0"
                >
                  {status.kind === "checking" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <RefreshCwIcon />
                  )}
                  {t("settings.about.checkButton")}
                </Button>
              </div>

              {status.kind === "up-to-date" && (
                <StatusLine icon={<CheckCircle2Icon className="size-4 text-emerald-500" />}>
                  {t("settings.about.upToDateDetail", { version: status.currentVersion })}
                </StatusLine>
              )}

              {status.kind === "available" && (
                <StatusLine icon={<DownloadIcon className="size-4 text-primary" />}>
                  <div className="flex-1">
                    <p className={ROW_LABEL}>
                      {t("settings.about.availableLabel", { version: status.latestVersion })}
                    </p>
                    {status.releaseNotes && (
                      <p className={ROW_DESC + " mt-1 whitespace-pre-wrap"}>
                        {status.releaseNotes}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onDownloadInApp}
                        disabled={busy}
                      >
                        <DownloadIcon />
                        {t("settings.about.downloadUpdate")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={ignoreVersion}>
                        <EyeOffIcon />
                        {t("settings.about.skipVersion")}
                      </Button>
                      {status.downloadPath && (
                        <Button variant="ghost" size="sm" onClick={onOpenDownloadPage}>
                          <ExternalLinkIcon />
                          {t("settings.about.openDownloadPage")}
                        </Button>
                      )}
                    </div>
                  </div>
                </StatusLine>
              )}

              {status.kind === "downloading" && (
                <StatusLine icon={<Loader2Icon className="size-4 text-primary animate-spin" />}>
                  <div className="flex-1 space-y-2">
                    <p className={ROW_LABEL}>
                      {status.latestVersion
                        ? t("settings.about.downloadingLabel", { version: status.latestVersion })
                        : t("settings.about.downloading")}
                    </p>
                    <Progress value={Math.min(100, Math.max(0, status.percent))} />
                    <p className={ROW_DESC}>
                      {t("settings.about.downloadProgress", {
                        percent: Math.round(status.percent),
                      })}
                    </p>
                  </div>
                </StatusLine>
              )}

              {status.kind === "downloaded" && (
                <StatusLine icon={<RocketIcon className="size-4 text-emerald-500" />}>
                  <div className="flex-1">
                    <p className={ROW_LABEL}>
                      {status.latestVersion
                        ? t("settings.about.downloadedLabel", { version: status.latestVersion })
                        : t("settings.about.downloaded")}
                    </p>
                    <p className={ROW_DESC}>{t("settings.about.restartToInstallDetail")}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onInstall}
                        disabled={busy}
                      >
                        <RocketIcon />
                        {t("settings.about.restartToInstall")}
                      </Button>
                      {status.downloadPath && (
                        <Button variant="ghost" size="sm" onClick={onOpenDownloadPage}>
                          <ExternalLinkIcon />
                          {t("settings.about.openDownloadPage")}
                        </Button>
                      )}
                    </div>
                  </div>
                </StatusLine>
              )}

              {status.kind === "ignored" && (
                <StatusLine icon={<EyeOffIcon className="size-4 text-muted-foreground" />}>
                  <div className="flex-1 flex items-center justify-between gap-3">
                    <div>
                      <p className={ROW_LABEL}>
                        {t("settings.about.availableLabel", { version: status.latestVersion })}
                      </p>
                      <p className={ROW_DESC}>{t("settings.about.skippedDetail")}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onDownloadInApp}
                        disabled={busy}
                      >
                        <DownloadIcon />
                        {t("settings.about.download")}
                      </Button>
                      {status.downloadPath && (
                        <Button variant="ghost" size="sm" onClick={onOpenDownloadPage}>
                          <ExternalLinkIcon />
                          {t("settings.about.openDownloadPage")}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={unignoreVersion}>
                        <RotateCcwIcon />
                        {t("settings.about.unskip")}
                      </Button>
                    </div>
                  </div>
                </StatusLine>
              )}

              {status.kind === "error" && (
                <StatusLine icon={<AlertTriangleIcon className="size-4 text-amber-500" />}>
                  <div className="flex-1 flex items-center justify-between gap-3">
                    <div>
                      <p className={ROW_LABEL}>{t("settings.about.checkFailedLabel")}</p>
                      <p className={ROW_DESC + " font-mono"}>{status.message}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {status.downloadPath && (
                        <Button variant="outline" size="sm" onClick={onOpenDownloadPage}>
                          <ExternalLinkIcon />
                          {t("settings.about.openDownloadPage")}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={doCheck} className="shrink-0">
                        <RefreshCwIcon />
                        {t("settings.about.retry")}
                      </Button>
                    </div>
                  </div>
                </StatusLine>
              )}

              {status.kind === "no-source" && (
                <StatusLine icon={<AlertTriangleIcon className="size-4 text-amber-500" />}>
                  <div className="flex-1">
                    <p className={ROW_LABEL}>{t("settings.about.noSourceLabel")}</p>
                    <p className={ROW_DESC}>{t("settings.about.noSourceDetail")}</p>
                  </div>
                </StatusLine>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusLine({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-1 py-2 border-t border-border/50 mt-1">
      <div className="pt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

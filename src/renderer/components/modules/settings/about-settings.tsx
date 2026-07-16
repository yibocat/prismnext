import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  CheckCircle2Icon,
  DownloadIcon,
  EyeOffIcon,
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import type { UpdateCheckResult } from "@/types/electron";
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
      latest: { version: string; path: string; releaseNotes?: string; pubDate?: string };
    }
  | {
      kind: "ignored";
      currentVersion: string;
      latest: { version: string; path: string; releaseNotes?: string; pubDate?: string };
    }
  | { kind: "error"; message: string }
  | { kind: "no-source" };

type OpencodeInfo = {
  available: boolean;
  version: string | null;
  error?: string;
};

function fromResult(result: UpdateCheckResult | null): Status {
  if (!result) return { kind: "idle" };
  switch (result.status) {
    case "up-to-date":
      return { kind: "up-to-date", currentVersion: result.currentVersion };
    case "available":
      return { kind: "available", currentVersion: result.currentVersion, latest: result.latest };
    case "ignored":
      return { kind: "ignored", currentVersion: result.currentVersion, latest: result.latest };
    case "error":
      return { kind: "error", message: result.error };
    case "no-source":
      return { kind: "no-source" };
  }
}

function formatOpencodeVersion(info: OpencodeInfo, t: TFunction): string {
  if (!info.available) return t("settings.about.notFound");
  if (info.version) return info.version;
  return info.error ? t("common.unavailable") : "—";
}

export function AboutSettings() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsStore();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [appVersion, setAppVersion] = useState<string>("—");
  const [opencodeInfo, setOpencodeInfo] = useState<OpencodeInfo | null>(null);
  const [sourceDraft, setSourceDraft] = useState(settings.updateSource ?? "");
  const [savedFlash, setSavedFlash] = useState(false);

  // On mount: surface any previously-cached check result without a network call.
  useEffect(() => {
    window.electronAPI
      .updateStatus()
      .then((r) => setStatus(fromResult(r)))
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

  const doCheck = useCallback(async () => {
    setStatus({ kind: "checking" });
    try {
      const result = await window.electronAPI.updateCheck();
      setStatus(fromResult(result));
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
    const result = await window.electronAPI.updateIgnore(status.latest.version);
    setStatus(fromResult(result));
  }, [status]);

  const unignoreVersion = useCallback(async () => {
    const result = await window.electronAPI.updateUnignore();
    setStatus(fromResult(result));
  }, []);

  const downloadUrl =
    status.kind === "available" || status.kind === "ignored" ? status.latest.path : null;

  const onDownload = useCallback(() => {
    if (!downloadUrl) return;
    window.electronAPI.shellOpenExternal(downloadUrl).catch(() => {
      /* user dismissed or URL blocked */
    });
  }, [downloadUrl]);

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
                  disabled={status.kind === "checking"}
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
                      {t("settings.about.availableLabel", { version: status.latest.version })}
                    </p>
                    {status.latest.releaseNotes && (
                      <p className={ROW_DESC + " mt-1 whitespace-pre-wrap"}>
                        {status.latest.releaseNotes}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button variant="default" size="sm" onClick={onDownload}>
                        <DownloadIcon />
                        {t("settings.about.downloadUpdate")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={ignoreVersion}>
                        <EyeOffIcon />
                        {t("settings.about.skipVersion")}
                      </Button>
                    </div>
                  </div>
                </StatusLine>
              )}

              {status.kind === "ignored" && (
                <StatusLine icon={<EyeOffIcon className="size-4 text-muted-foreground" />}>
                  <div className="flex-1 flex items-center justify-between gap-3">
                    <div>
                      <p className={ROW_LABEL}>
                        {t("settings.about.availableLabel", { version: status.latest.version })}
                      </p>
                      <p className={ROW_DESC}>{t("settings.about.skippedDetail")}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={onDownload}>
                        <DownloadIcon />
                        {t("settings.about.download")}
                      </Button>
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
                    <Button variant="ghost" size="sm" onClick={doCheck} className="shrink-0">
                      <RefreshCwIcon />
                      {t("settings.about.retry")}
                    </Button>
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

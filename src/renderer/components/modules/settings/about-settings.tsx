import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  CheckCircle2Icon,
  Loader2Icon,
  RefreshCwIcon,
  RocketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  mapUpdaterStatus,
  type UpdateUiStatus,
} from "@/lib/updates/map-updater-status";
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

type Status = UpdateUiStatus;

type OpencodeInfo = {
  available: boolean;
  version: string | null;
  error?: string;
};

function formatOpencodeVersion(info: OpencodeInfo, t: TFunction): string {
  if (!info.available) return t("settings.about.notFound");
  if (info.version) return info.version;
  return info.error ? t("common.unavailable") : "—";
}

export function AboutSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [appVersion, setAppVersion] = useState<string>("—");
  const [opencodeInfo, setOpencodeInfo] = useState<OpencodeInfo | null>(null);
  const [busy, setBusy] = useState(false);

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
      setStatus(mapUpdaterStatus(result));
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Open About → soft auto-check against baked default feed.
  useEffect(() => {
    void doCheck();
  }, [doCheck]);

  /** One-click: download then quit-and-install. */
  const onOneClickUpdate = useCallback(async () => {
    setBusy(true);
    try {
      const current = await window.electronAPI.updateStatus();
      let result = current;
      if (current.status !== "downloaded") {
        setStatus((prev) => ({
          kind: "downloading",
          currentVersion:
            "currentVersion" in prev ? prev.currentVersion : current.currentVersion,
          latestVersion:
            ("latestVersion" in prev ? prev.latestVersion : undefined) ??
            current.latestVersion,
          percent: 0,
          downloadPath:
            ("downloadPath" in prev ? prev.downloadPath : undefined) ??
            current.latest?.path,
        }));
        result = await window.electronAPI.updateDownload();
        setStatus(mapUpdaterStatus(result));
      }
      if (result.status !== "downloaded") {
        setBusy(false);
        return;
      }
      await window.electronAPI.updateInstall();
    } catch (err) {
      setBusy(false);
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const displayAppVersion =
    appVersion !== "—"
      ? appVersion
      : "currentVersion" in status
        ? status.currentVersion
        : "—";

  const opencodeVersion = opencodeInfo ? formatOpencodeVersion(opencodeInfo, t) : "—";
  const latestVersion =
    status.kind === "available" ||
    status.kind === "downloading" ||
    status.kind === "downloaded" ||
    status.kind === "ignored"
      ? status.latestVersion
      : undefined;

  const canOneClick =
    status.kind === "available" || status.kind === "downloaded";



  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            {t("settings.about.title")}
          </h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.about.subtitle")}
          </p>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.about.checkForUpdates")}</h3>
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                {status.kind === "checking" ? (
                  <>
                    <p className={ROW_LABEL}>{t("settings.about.updatesStatus")}</p>
                    <p className={ROW_DESC}>{t("settings.about.checking")}</p>
                  </>
                ) : status.kind === "up-to-date" ? (
                  <>
                    <p className={ROW_LABEL}>{t("settings.about.updatesStatus")}</p>
                    <p className={`${ROW_DESC} flex items-center gap-1.5`}>
                      <CheckCircle2Icon className="size-3 shrink-0 text-emerald-500" />
                      {t("settings.about.upToDateDetail", { version: status.currentVersion })}
                    </p>
                  </>
                ) : status.kind === "error" ? (
                  <>
                    <p className={ROW_LABEL}>{t("settings.about.checkFailedLabel")}</p>
                    <p className={ROW_DESC + " font-mono"}>{status.message}</p>
                  </>
                ) : status.kind === "no-source" ? (
                  <>
                    <p className={ROW_LABEL}>{t("settings.about.noSourceLabel")}</p>
                    <p className={ROW_DESC}>{t("settings.about.noSourceDevOnly")}</p>
                  </>
                ) : canOneClick ? (
                  <>
                    <p className={ROW_LABEL}>
                      {t("settings.about.availableLabel", {
                        version: latestVersion ?? "",
                      })}
                    </p>
                    <p className={ROW_DESC}>
                      {t("settings.about.installedVsLatest", {
                        current:
                          "currentVersion" in status
                            ? status.currentVersion
                            : displayAppVersion,
                        latest: latestVersion ?? "",
                      })}
                    </p>
                  </>
                ) : status.kind === "downloading" ? (
                  <div className="space-y-2">
                    <p className={ROW_LABEL}>
                      {status.latestVersion
                        ? t("settings.about.downloadingLabel", {
                            version: status.latestVersion,
                          })
                        : t("settings.about.downloading")}
                    </p>
                    <Progress value={Math.min(100, Math.max(0, status.percent))} />
                    <p className={ROW_DESC}>
                      {t("settings.about.downloadProgress", {
                        percent: Math.round(status.percent),
                      })}
                    </p>
                  </div>
                ) : (
                  <p className={ROW_LABEL}>{t("settings.about.updatesStatus")}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {canOneClick || status.kind === "downloading" ? (
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => void onOneClickUpdate()}
                    disabled={busy || status.kind === "downloading"}
                  >
                    {busy || status.kind === "downloading" ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <RocketIcon />
                    )}
                    {status.kind === "downloading"
                      ? t("settings.about.downloading")
                      : t("settings.about.oneClickUpdate")}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => void doCheck()}
                    disabled={status.kind === "checking" || busy}
                  >
                    {status.kind === "checking" ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <RefreshCwIcon />
                    )}
                    {t("settings.about.checkButton")}
                  </Button>
                )}
              </div>
            </div>

            {canOneClick && status.kind === "available" && status.releaseNotes ? (
              <div className="border-t border-border/60 py-2.5">
                <p className={ROW_DESC + " whitespace-pre-wrap mt-0"}>{status.releaseNotes}</p>
              </div>
            ) : null}
          </div>
        </div>

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
      </div>
    </div>
  );
}

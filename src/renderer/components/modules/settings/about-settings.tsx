import { useEffect, useState, useCallback } from "react";
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

export function AboutSettings() {
  const { settings, updateSettings } = useSettingsStore();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [sourceDraft, setSourceDraft] = useState(settings.updateSource ?? "");
  const [savedFlash, setSavedFlash] = useState(false);

  // On mount: surface any previously-cached check result without a network call.
  useEffect(() => {
    window.electronAPI
      .updateStatus()
      .then((r) => setStatus(fromResult(r)))
      .catch(() => setStatus({ kind: "idle" }));
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

  // Derive a display version from status, falling back to a placeholder until
  // the first check establishes the authoritative value from app.getVersion().
  const currentVersion =
    "currentVersion" in status ? status.currentVersion : "—";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        {/* ── Header ── */}
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">About</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Version information and update checks.
          </p>
        </div>

        {/* ── Version ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Version</h3>
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>Prism Next</p>
                <p className={ROW_DESC}>Installed application version.</p>
              </div>
              <span className="font-mono text-[length:var(--font-size-13)] text-muted-foreground shrink-0">
                {currentVersion}
              </span>
            </div>
          </div>
        </div>

        {/* ── Update source ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Update source</h3>
          <div className={CARD}>
            <div className="px-1 py-3 space-y-3">
              <div className="px-1">
                <p className={ROW_LABEL}>Manifest URL or local path</p>
                <p className={ROW_DESC + " mb-2"}>
                  A local file path or HTTPS URL pointing to a <code className="text-[length:var(--font-size-12)]">version.json</code>{" "}
                  manifest. Leave empty to disable update checks.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={sourceDraft}
                    onChange={(e) => setSourceDraft(e.target.value)}
                    placeholder="/path/to/version.json  or  https://host/version.json"
                    className="font-mono text-[length:var(--font-size-12)]"
                  />
                  <Button variant="outline" size="sm" onClick={saveSource} className="shrink-0">
                    {savedFlash ? "Saved" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Check for updates ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Check for updates</h3>
          <div className={CARD}>
            <div className="px-1 py-3 space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="min-w-0 flex-1 pr-4">
                  <p className={ROW_LABEL}>
                    {status.kind === "checking" ? "Checking…" : "Check now"}
                  </p>
                  <p className={ROW_DESC}>
                    Compare the installed version against the manifest. New versions open in
                    your browser for download.
                  </p>
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
                  Check for updates
                </Button>
              </div>

              {status.kind === "up-to-date" && (
                <StatusLine icon={<CheckCircle2Icon className="size-4 text-emerald-500" />}>
                  You're on the latest version ({status.currentVersion}).
                </StatusLine>
              )}

              {status.kind === "available" && (
                <StatusLine icon={<DownloadIcon className="size-4 text-primary" />}>
                  <div className="flex-1">
                    <p className={ROW_LABEL}>Version {status.latest.version} is available</p>
                    {status.latest.releaseNotes && (
                      <p className={ROW_DESC + " mt-1 whitespace-pre-wrap"}>
                        {status.latest.releaseNotes}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button variant="default" size="sm" onClick={onDownload}>
                        <DownloadIcon />
                        Download update
                      </Button>
                      <Button variant="ghost" size="sm" onClick={ignoreVersion}>
                        <EyeOffIcon />
                        Skip this version
                      </Button>
                    </div>
                  </div>
                </StatusLine>
              )}

              {status.kind === "ignored" && (
                <StatusLine icon={<EyeOffIcon className="size-4 text-muted-foreground" />}>
                  <div className="flex-1 flex items-center justify-between gap-3">
                    <div>
                      <p className={ROW_LABEL}>Version {status.latest.version} is available</p>
                      <p className={ROW_DESC}>You've skipped this version.</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={onDownload}>
                        <DownloadIcon />
                        Download
                      </Button>
                      <Button variant="ghost" size="sm" onClick={unignoreVersion}>
                        <RotateCcwIcon />
                        Unskip
                      </Button>
                    </div>
                  </div>
                </StatusLine>
              )}

              {status.kind === "error" && (
                <StatusLine icon={<AlertTriangleIcon className="size-4 text-amber-500" />}>
                  <div className="flex-1 flex items-center justify-between gap-3">
                    <div>
                      <p className={ROW_LABEL}>Check failed</p>
                      <p className={ROW_DESC + " font-mono"}>{status.message}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={doCheck} className="shrink-0">
                      <RefreshCwIcon />
                      Retry
                    </Button>
                  </div>
                </StatusLine>
              )}

              {status.kind === "no-source" && (
                <StatusLine icon={<AlertTriangleIcon className="size-4 text-amber-500" />}>
                  <div className="flex-1">
                    <p className={ROW_LABEL}>No update source configured</p>
                    <p className={ROW_DESC}>
                      Set a manifest URL or local path above to enable update checks.
                    </p>
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

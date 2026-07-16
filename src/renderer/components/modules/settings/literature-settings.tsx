import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  CheckCircle2Icon,
  XCircleIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import type { LiteratureStorageStats, ZoteroStatus } from "@/types/electron.d";
import {
  isLiteratureAiMetadataConfigured,
  literatureAiMetadataModelLabel,
} from "../../../../shared/literature-ai-metadata-model";

const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium leading-none";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const SECTION_TITLE = "text-[length:var(--font-size-14)] font-semibold";
const SECTION_DESC = "text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5";

function statusLabel(status: ZoteroStatus, t: TFunction): string {
  if (status.mode === "local") {
    const parts = ["Zotero desktop"];
    if (status.bbtInstalled) parts.push("Better BibTeX");
    if (status.bbtDebugBridge) parts.push("debug-bridge");
    if (status.webReachable) parts.push("Web API");
    const canEditCollections = status.bbtDebugBridge || status.webReachable;
    const suffix = canEditCollections
      ? t("settings.literaturePage.status.collectionEditsOk")
      : status.bbtInstalled
        ? t("settings.literaturePage.status.readOnlyBbt")
        : t("settings.literaturePage.status.readOnlyWeb");
    return t("settings.literaturePage.status.connectedLocal", {
      parts: parts.join(" + "),
      suffix,
    });
  }
  if (status.mode === "web") return t("settings.literaturePage.status.connectedWeb");
  return status.error ?? t("settings.literaturePage.status.notConnected");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function LiteratureSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const refreshPdfCacheStatus = useLiteratureStore((s) => s.refreshPdfCacheStatus);

  const [showKey, setShowKey] = useState(false);
  const [showMineruKey, setShowMineruKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingMineru, setTestingMineru] = useState(false);
  const [mineruStatus, setMineruStatus] = useState<string | null>(null);
  const [mineruTestOk, setMineruTestOk] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ZoteroStatus | null>(null);

  const [storageStats, setStorageStats] = useState<LiteratureStorageStats | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [pruning, setPruning] = useState(false);

  const loadStorageStats = useCallback(async () => {
    if (!projectRoot) {
      setStorageStats(null);
      return;
    }
    setStorageLoading(true);
    try {
      const stats = await window.electronAPI.literatureGetStorageStats(projectRoot);
      setStorageStats(stats);
    } catch {
      setStorageStats(null);
    } finally {
      setStorageLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadStorageStats();
  }, [loadStorageStats]);

  const handleTestMineru = async () => {
    setTestingMineru(true);
    try {
      const result = await window.electronAPI.extractTestMineru(settings.mineruApiToken as string | undefined);
      setMineruStatus(result.message);
      setMineruTestOk(true);
      toast.success(result.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "MinerU test failed";
      setMineruStatus(msg);
      setMineruTestOk(false);
      toast.error(msg);
    } finally {
      setTestingMineru(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await window.electronAPI.zoteroProbe();
      setStatus(result);
    } catch (err) {
      setStatus({
        mode: "offline",
        localReachable: false,
        bbtInstalled: false,
        bbtDebugBridge: false,
        webReachable: false,
        error: err instanceof Error ? err.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handlePruneOrphans = async () => {
    if (!projectRoot) return;
    setPruning(true);
    try {
      const result = await window.electronAPI.literaturePruneOrphanAttachments(projectRoot);
      await loadStorageStats();
      await refreshPdfCacheStatus(projectRoot);
      if (result.deletedFiles === 0) {
        toast.success(t("settings.literaturePage.toast.noUnusedPdf"));
      } else {
        toast.success(
          t("settings.literaturePage.toast.removedUnusedPdf", {
            count: result.deletedFiles,
            bytes: formatBytes(result.freedBytes),
          }),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.literaturePage.toast.cleanupFailed"));
    } finally {
      setPruning(false);
    }
  };

  const canPrune =
    Boolean(projectRoot && storageStats) &&
    (storageStats!.orphanCount > 0 || storageStats!.legacyPdfCacheBytes > 0);

  const aiMetadataModelLabel = literatureAiMetadataModelLabel(settings);
  const aiMetadataReady = isLiteratureAiMetadataConfigured(settings);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.literaturePage.title")}</h2>
          <p className={SECTION_DESC}>{t("settings.literaturePage.pageDesc")}</p>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className={SECTION_TITLE}>{t("settings.literaturePage.libraryStorage")}</h3>
            <p className={SECTION_DESC}>{t("settings.literaturePage.storageDesc")}</p>
          </div>
          <div className={CARD}>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.project")}</p>
                <p className={ROW_DESC}>
                  {projectRoot
                    ? t("settings.literaturePage.rowDesc.currentProject")
                    : t("settings.literaturePage.rowDesc.openProjectCache")}
                </p>
              </div>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.cachedPdfs")}</p>
                <p className={ROW_DESC}>
                  {storageLoading
                    ? t("common.calculating")
                    : !projectRoot
                      ? "—"
                      : storageStats
                        ? t("settings.literaturePage.rowDesc.cachedFiles", {
                            count: storageStats.attachmentCount,
                            bytes: formatBytes(storageStats.attachmentBytes),
                          })
                        : t("common.unavailable")}
                </p>
              </div>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.unusedFiles")}</p>
                <p className={ROW_DESC}>
                  {storageLoading
                    ? t("common.calculating")
                    : !projectRoot
                      ? "—"
                      : storageStats
                        ? storageStats.orphanCount > 0 || storageStats.legacyPdfCacheBytes > 0
                          ? t("settings.literaturePage.rowDesc.unusedSummary", {
                              count: storageStats.orphanCount,
                              bytes: formatBytes(
                                storageStats.orphanBytes + storageStats.legacyPdfCacheBytes,
                              ),
                              legacy: storageStats.legacyPdfCacheBytes
                                ? t("settings.literaturePage.rowDesc.unusedLegacy")
                                : "",
                            })
                          : t("settings.literaturePage.rowDesc.noUnused")
                        : t("common.unavailable")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0"
                disabled={!projectRoot || pruning || storageLoading || !canPrune}
                onClick={() => void handlePruneOrphans()}
              >
                {pruning ? (
                  <Loader2Icon className="size-3 animate-spin mr-1" />
                ) : (
                  <Trash2Icon className="size-3 mr-1" />
                )}
                {t("settings.literaturePage.actions.cleanUp")}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className={SECTION_TITLE}>{t("settings.literaturePage.pdfExtraction")}</h3>
            <p className={SECTION_DESC}>{t("settings.literaturePage.extractDesc")}</p>
          </div>
          <div className={CARD}>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.defaultEngine")}</p>
                <p className={ROW_DESC}>{t("settings.literaturePage.rowDesc.defaultEngine")}</p>
              </div>
              <select
                className="h-7 rounded-md border border-border bg-background px-2 text-[length:var(--font-size-12)]"
                value={(settings.literatureExtractEngineDefault as string) || "pdfjs"}
                onChange={(e) =>
                  updateSettings({
                    literatureExtractEngineDefault: e.target.value as "pdfjs" | "mineru",
                  })
                }
              >
                <option value="pdfjs">{t("settings.literaturePage.options.pdfjs")}</option>
                <option value="mineru">{t("settings.literaturePage.options.mineru")}</option>
              </select>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.mineruToken")}</p>
                <p className={ROW_DESC}>{t("settings.literaturePage.rowDesc.mineruToken")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type={showMineruKey ? "text" : "password"}
                  className="!h-7 !text-[length:var(--font-size-12)] w-48"
                  placeholder={t("settings.literaturePage.placeholders.mineruToken")}
                  value={(settings.mineruApiToken as string) || ""}
                  onChange={(e) => {
                    updateSettings({ mineruApiToken: e.target.value });
                    setMineruTestOk(null);
                    setMineruStatus(null);
                  }}
                />
                <Button variant="ghost" size="icon-xs" onClick={() => setShowMineruKey(!showMineruKey)}>
                  {showMineruKey ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
                </Button>
              </div>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.mineruConnection")}</p>
                <p className={ROW_DESC}>
                  {mineruStatus ?? t("settings.literaturePage.rowDesc.mineruTestHint")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0"
                onClick={() => void handleTestMineru()}
                disabled={testingMineru}
              >
                {testingMineru ? (
                  <Loader2Icon className="size-3 animate-spin mr-1" />
                ) : mineruTestOk === true ? (
                  <CheckCircle2Icon className="size-3 mr-1 text-green-600" />
                ) : mineruTestOk === false ? (
                  <XCircleIcon className="size-3 mr-1 text-destructive" />
                ) : null}
                {t("common.testConnection")}
              </Button>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.autoExtract")}</p>
                <p className={ROW_DESC}>{t("settings.literaturePage.rowDesc.autoExtract")}</p>
              </div>
              <Switch
                checked={Boolean(settings.literatureAutoExtractOnImport)}
                onCheckedChange={(checked) =>
                  updateSettings({ literatureAutoExtractOnImport: checked })
                }
              />
            </div>
            <div className={ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.autoAiMetadata")}</p>
                <p className={ROW_DESC}>
                  {t("settings.literaturePage.rowDesc.autoAiMetadata")}
                  {aiMetadataReady && aiMetadataModelLabel ? (
                    <>
                      {" "}
                      {t("settings.literaturePage.rowDesc.autoAiUses", {
                        model: aiMetadataModelLabel,
                      })}
                    </>
                  ) : (
                    <> {t("settings.literaturePage.rowDesc.autoAiSetup")}</>
                  )}
                </p>
              </div>
              <Switch
                checked={Boolean(settings.literatureAutoAiMetadata)}
                disabled={!aiMetadataReady}
                onCheckedChange={(checked) => {
                  if (checked && !aiMetadataReady) {
                    toast.error(t("settings.literaturePage.rowDesc.autoAiSetup"));
                    return;
                  }
                  void updateSettings({ literatureAutoAiMetadata: checked });
                }}
              />
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.strictIntensive")}</p>
                <p className={ROW_DESC}>{t("settings.literaturePage.rowDesc.strictIntensive")}</p>
              </div>
              <Switch
                checked={settings.literatureStrictIntensivePdf !== false}
                onCheckedChange={(checked) =>
                  updateSettings({ literatureStrictIntensivePdf: checked })
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className={SECTION_TITLE}>{t("settings.literaturePage.zotero")}</h3>
            <p className={SECTION_DESC}>{t("settings.literaturePage.zoteroDesc")}</p>
          </div>
          <div className={CARD}>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.apiKey")}</p>
                <p className={ROW_DESC}>{t("settings.literaturePage.rowDesc.apiKey")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type={showKey ? "text" : "password"}
                  className="!h-7 !text-[length:var(--font-size-12)] w-48"
                  placeholder={t("settings.literaturePage.placeholders.apiKey")}
                  value={settings.zoteroApiKey || ""}
                  onChange={(e) => updateSettings({ zoteroApiKey: e.target.value })}
                />
                <Button variant="ghost" size="icon-xs" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
                </Button>
              </div>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.userId")}</p>
                <p className={ROW_DESC}>{t("settings.literaturePage.rowDesc.userId")}</p>
              </div>
              <Input
                className="!h-7 !text-[length:var(--font-size-12)] w-48"
                placeholder="123456"
                value={settings.zoteroUserId || ""}
                onChange={(e) => updateSettings({ zoteroUserId: e.target.value })}
              />
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>{t("settings.literaturePage.rows.connection")}</p>
                <p className={ROW_DESC}>
                  {status
                    ? statusLabel(status, t)
                    : t("settings.literaturePage.rowDesc.connectionHint")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0"
                onClick={() => void handleTestConnection()}
                disabled={testing}
              >
                {testing ? (
                  <Loader2Icon className="size-3 animate-spin mr-1" />
                ) : status?.mode !== "offline" ? (
                  <CheckCircle2Icon className="size-3 mr-1 text-green-600" />
                ) : status ? (
                  <XCircleIcon className="size-3 mr-1 text-destructive" />
                ) : null}
                {t("common.testConnection")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

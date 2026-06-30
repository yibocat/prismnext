import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium leading-none";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const SECTION_TITLE = "text-[length:var(--font-size-14)] font-semibold";
const SECTION_DESC = "text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5";

function statusLabel(status: ZoteroStatus): string {
  if (status.mode === "local") {
    const parts = ["Zotero desktop"];
    if (status.bbtInstalled) parts.push("Better BibTeX");
    if (status.bbtDebugBridge) parts.push("debug-bridge");
    if (status.webReachable) parts.push("Web API");
    const canEditCollections = status.bbtDebugBridge || status.webReachable;
    const suffix = canEditCollections
      ? "collection edits OK"
      : status.bbtInstalled
        ? "read-only collections (add Web API or debug-bridge plugin)"
        : "read-only collections (add Web API)";
    return `Connected (${parts.join(" + ")}) — ${suffix}`;
  }
  if (status.mode === "web") return "Connected (Zotero web API)";
  return status.error ?? "Not connected";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function LiteratureSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const refreshPdfCacheStatus = useLiteratureStore((s) => s.refreshPdfCacheStatus);

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
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
        toast.success("No unused PDF files to remove");
      } else {
        toast.success(
          `Removed ${result.deletedFiles} unused PDF file${result.deletedFiles === 1 ? "" : "s"} (${formatBytes(result.freedBytes)})`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setPruning(false);
    }
  };

  const canPrune =
    Boolean(projectRoot && storageStats) &&
    (storageStats!.orphanCount > 0 || storageStats!.legacyPdfCacheBytes > 0);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Literature</h2>
          <p className={SECTION_DESC}>
            Project library storage and optional Zotero integration. PDFs opened from Zotero are
            cached under <span className="font-mono text-[length:var(--font-size-11)]">.prismnext/library/attachments/</span>.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className={SECTION_TITLE}>Library storage</h3>
            <p className={SECTION_DESC}>
              Cached PDFs stay until you delete the entry or remove unreferenced files below.
            </p>
          </div>
          <div className={CARD}>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>Project</p>
                <p className={ROW_DESC}>
                  {projectRoot ? "Current open project" : "Open a project to manage its library cache."}
                </p>
              </div>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>Cached PDFs</p>
                <p className={ROW_DESC}>
                  {storageLoading
                    ? "Calculating…"
                    : !projectRoot
                      ? "—"
                      : storageStats
                        ? `${storageStats.attachmentCount} file${storageStats.attachmentCount === 1 ? "" : "s"} · ${formatBytes(storageStats.attachmentBytes)} total`
                        : "Unavailable"}
                </p>
              </div>
            </div>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>Unused files</p>
                <p className={ROW_DESC}>
                  {storageLoading
                    ? "Calculating…"
                    : !projectRoot
                      ? "—"
                      : storageStats
                        ? storageStats.orphanCount > 0 || storageStats.legacyPdfCacheBytes > 0
                          ? `${storageStats.orphanCount} unreferenced PDF${storageStats.orphanCount === 1 ? "" : "s"} (${formatBytes(storageStats.orphanBytes + storageStats.legacyPdfCacheBytes)}${storageStats.legacyPdfCacheBytes ? ", includes legacy cache" : ""})`
                          : "No unreferenced PDF files"
                        : "Unavailable"}
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
                Clean up
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className={SECTION_TITLE}>Zotero</h3>
            <p className={SECTION_DESC}>
              Optional — stream PDFs from Zotero desktop when running. Better BibTeX enables
              citekeys; collection edits need Web API credentials or the debug-bridge add-on.
            </p>
          </div>
          <div className={CARD}>
            <div className={ROW}>
              <div>
                <p className={ROW_LABEL}>API Key</p>
                <p className={ROW_DESC}>From zotero.org/settings/keys — needed when desktop is off.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type={showKey ? "text" : "password"}
                  className="!h-7 !text-[length:var(--font-size-12)] w-48"
                  placeholder="Enter key…"
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
                <p className={ROW_LABEL}>User ID</p>
                <p className={ROW_DESC}>Numeric user ID from the same keys page.</p>
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
                <p className={ROW_LABEL}>Connection</p>
                <p className={ROW_DESC}>
                  {status ? statusLabel(status) : "Test after saving credentials or starting Zotero."}
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
                Test connection
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  Loader2Icon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CitationHealthReport } from "@/types/electron.d";
import { cn } from "@/lib/utils";

function StatusRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 text-[length:var(--font-size-13)]">
      {ok ? (
        <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600 mt-0.5" />
      ) : (
        <XCircleIcon className="size-4 shrink-0 text-amber-600 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function LiteratureCitationHealthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const fetchCitationHealth = useLiteratureStore((s) => s.fetchCitationHealth);
  const syncCitedLibraryToManuscriptBib = useLiteratureStore((s) => s.syncCitedLibraryToManuscriptBib);
  const importMissingFromManuscriptBib = useLiteratureStore((s) => s.importMissingFromManuscriptBib);

  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [report, setReport] = useState<CitationHealthReport | null>(null);

  const load = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    try {
      setReport(await fetchCitationHealth(projectRoot));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Citation check failed");
    } finally {
      setLoading(false);
    }
  }, [projectRoot, fetchCitationHealth]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const bib = report?.bibCheck;
  const library = report?.libraryCheck;
  const importable = report?.bibFallback.filter((e) => e.canImportFromBib) ?? [];
  const notInBib = report?.bibFallback.filter((e) => !e.canImportFromBib) ?? [];
  const bibOrphans = report?.bibKeysNotInLibrary ?? [];

  const bibOk =
    !!bib && bib.missingKeys.length === 0 && bib.duplicateKeys.length === 0;
  const libraryOk = !!library && library.missingKeys.length === 0;
  const policyOk = bibOrphans.length === 0 && libraryOk;

  const handleSyncLibraryToBib = async () => {
    if (!projectRoot) return;
    setActing("sync-bib");
    try {
      await syncCitedLibraryToManuscriptBib(projectRoot);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setActing(null);
    }
  };

  const handleImportFromBib = async () => {
    if (!projectRoot || importable.length === 0) return;
    setActing("import-lib");
    try {
      await importMissingFromManuscriptBib(
        projectRoot,
        importable.map((e) => e.bibkey),
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("literature.dialogs.citationHealthTitle")}</DialogTitle>
          <DialogDescription>
            {t("literature.dialogs.citationHealthDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-1">
          {loading && !report ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[length:var(--font-size-13)]">
              <Loader2Icon className="size-4 animate-spin" />
              {t("literature.dialogs.scanning")}
            </div>
          ) : report ? (
            <>
              <div className="space-y-3 rounded-lg border border-border p-3">
                <StatusRow
                  ok={bibOk}
                  label={t("literature.citations.texBib")}
                  detail={
                    bibOk
                      ? t("literature.citations.bibMatch", {
                          count: bib?.citeKeysInTex.length ?? 0,
                          bib: bib?.bibPath ?? "references.bib",
                        })
                      : t("literature.citations.bibIssues", {
                          missing: bib?.missingKeys.length ?? 0,
                          duplicates: bib?.duplicateKeys.length ?? 0,
                        })
                  }
                />
                <StatusRow
                  ok={libraryOk}
                  label={t("literature.citations.libDb")}
                  detail={
                    libraryOk
                      ? t("literature.citations.allOk")
                      : t("literature.citations.libraryMissing", {
                          count: library?.missingKeys.length ?? 0,
                        })
                  }
                />
                {bibOrphans.length > 0 ? (
                  <StatusRow
                    ok={false}
                    label={t("literature.citations.policy")}
                    detail={t("literature.citations.policyMissing", {
                      count: bibOrphans.length,
                    })}
                  />
                ) : (
                  <StatusRow
                    ok={policyOk}
                    label={t("literature.citations.policy")}
                    detail={t("literature.citations.policyOk")}
                  />
                )}
                {bib?.bibPath ? (
                  <p className="text-[length:var(--font-size-11)] text-muted-foreground truncate pl-6">
                    Bib: {bib.bibPath}
                  </p>
                ) : null}
              </div>

              {importable.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[length:var(--font-size-12)] font-medium text-foreground">
                    {t("literature.citations.inBib")} ({importable.length})
                  </p>
                  <ul className="max-h-36 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                    {importable.slice(0, 12).map((entry) => (
                      <li
                        key={entry.bibkey}
                        className="px-2.5 py-1.5 text-[length:var(--font-size-12)]"
                      >
                        <span className="font-mono text-foreground">{entry.bibkey}</span>
                        {entry.title ? (
                          <span className="text-muted-foreground"> — {entry.title}</span>
                        ) : null}
                      </li>
                    ))}
                    {importable.length > 12 ? (
                      <li className="px-2.5 py-1.5 text-muted-foreground text-[length:var(--font-size-11)]">
                        {t("literature.citations.more", { count: importable.length - 12 })}
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {notInBib.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[length:var(--font-size-12)] font-medium text-foreground">
                    {t("literature.citations.notFound")} ({notInBib.length})
                  </p>
                  <p className="text-[length:var(--font-size-11)] text-muted-foreground">
                    {t("literature.citations.notFoundHint")}
                  </p>
                  <p className="font-mono text-[length:var(--font-size-11)] text-muted-foreground break-all">
                    {notInBib.map((e) => e.bibkey).join(", ")}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void load()}
            disabled={loading || acting != null}
            className="sm:mr-auto"
          >
            <RefreshCwIcon className={cn("size-3.5 mr-1", loading && "animate-spin")} />
            {t("literature.citations.refresh")}
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            {importable.length > 0 ? (
              <Button
                size="xs"
                variant="outline"
                disabled={acting != null || loading}
                onClick={() => void handleImportFromBib()}
              >
                {acting === "import-lib" ? (
                  <Loader2Icon className="size-3.5 animate-spin mr-1" />
                ) : null}
                {t("literature.citations.importBib")}
              </Button>
            ) : null}
            {!libraryOk && bibOk ? (
              <Button
                size="xs"
                disabled={acting != null || loading}
                onClick={() => void handleSyncLibraryToBib()}
              >
                {acting === "sync-bib" ? (
                  <Loader2Icon className="size-3.5 animate-spin mr-1" />
                ) : null}
                {t("literature.citations.syncBib")}
              </Button>
            ) : null}
            <Button size="xs" variant="secondary" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

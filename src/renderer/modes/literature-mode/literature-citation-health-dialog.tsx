import { useCallback, useEffect, useState } from "react";
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
          <DialogTitle>Manuscript citations</DialogTitle>
          <DialogDescription>
            Library-first rule: every manuscript cite must exist in the literature library.
            `.bib` entries must be synced from the library (canonical metadata). Fixes use real
            file data — no guessing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-1">
          {loading && !report ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[length:var(--font-size-13)]">
              <Loader2Icon className="size-4 animate-spin" />
              Scanning project…
            </div>
          ) : report ? (
            <>
              <div className="space-y-3 rounded-lg border border-border p-3">
                <StatusRow
                  ok={bibOk}
                  label=".tex ↔ manuscript .bib"
                  detail={
                    bibOk
                      ? `${bib?.citeKeysInTex.length ?? 0} cited keys match ${bib?.bibPath ?? "references.bib"}`
                      : `${bib?.missingKeys.length ?? 0} missing in .bib · ${bib?.duplicateKeys.length ?? 0} duplicate`
                  }
                />
                <StatusRow
                  ok={libraryOk}
                  label=".tex ↔ literature library (primary)"
                  detail={
                    libraryOk
                      ? "All cited keys exist in library.db"
                      : `${library?.missingKeys.length ?? 0} cited keys not in library — import before syncing .bib`
                  }
                />
                {bibOrphans.length > 0 ? (
                  <StatusRow
                    ok={false}
                    label="Manuscript .bib ↔ library (policy)"
                    detail={`${bibOrphans.length} .bib entries not in library — import to library, then re-sync from library`}
                  />
                ) : (
                  <StatusRow
                    ok={policyOk}
                    label="Manuscript .bib ↔ library (policy)"
                    detail="All .bib entries trace to the literature library"
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
                    In manuscript .bib — can import to library ({importable.length})
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
                        +{importable.length - 12} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {notInBib.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[length:var(--font-size-12)] font-medium text-foreground">
                    Not in library or manuscript .bib ({notInBib.length})
                  </p>
                  <p className="text-[length:var(--font-size-11)] text-muted-foreground">
                    Add to library via DOI/arXiv import, or add BibTeX to references.bib first.
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
            size="sm"
            onClick={() => void load()}
            disabled={loading || acting != null}
            className="sm:mr-auto"
          >
            <RefreshCwIcon className={cn("size-3.5 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            {importable.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={acting != null || loading}
                onClick={() => void handleImportFromBib()}
              >
                {acting === "import-lib" ? (
                  <Loader2Icon className="size-3.5 animate-spin mr-1" />
                ) : null}
                Import from .bib → library
              </Button>
            ) : null}
            {!libraryOk && bibOk ? (
              <Button
                size="sm"
                disabled={acting != null || loading}
                onClick={() => void handleSyncLibraryToBib()}
              >
                {acting === "sync-bib" ? (
                  <Loader2Icon className="size-3.5 animate-spin mr-1" />
                ) : null}
                Sync library → .bib
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

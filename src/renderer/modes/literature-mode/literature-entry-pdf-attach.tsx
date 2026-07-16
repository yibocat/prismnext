import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { i18n } from "@/lib/i18n";
import {
  formatIdentifierBrief,
  normalizeLiteratureIdentifiers,
} from "../../../shared/literature-pdf-identity";
import type { LiteratureAttachLocalPdfConflict } from "@/types/electron.d";
import {
  identifierLabel,
  type LiteraturePdfAttachHandle,
} from "@/lib/literature/use-literature-pdf-attach";

export type { LiteraturePdfAttachHandle };

function calloutClass(kind: LiteratureAttachLocalPdfConflict["kind"]): string {
  switch (kind) {
    case "target_mismatch":
    case "target_unverified":
      return "border-warning/30 bg-warning/10 text-warning";
    case "identifier_duplicate":
      return "border-info/30 bg-info/10 text-info";
    case "sha_duplicate":
      return "border-border bg-muted/30 text-muted-foreground";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function conflictCopy(conflict: LiteratureAttachLocalPdfConflict): {
  title: string;
  subtitle: string;
  message: string;
} {
  switch (conflict.kind) {
    case "sha_duplicate":
      return {
        title: i18n.t("literature.attach.alreadyInLibrary"),
        subtitle: i18n.t("literature.attach.duplicateFile"),
        message: i18n.t("literature.attach.shaDuplicateMsg"),
      };
    case "identifier_duplicate":
      return {
        title: i18n.t("literature.attach.samePaper"),
        subtitle: identifierLabel(conflict),
        message: i18n.t("literature.attach.identifierDuplicateMsg"),
      };
    case "target_mismatch":
      return {
        title: i18n.t("literature.attach.mayNotMatch"),
        subtitle: i18n.t("literature.attach.idMismatch"),
        message: i18n.t("literature.attach.targetMismatchMsg"),
      };
    case "target_unverified":
      return {
        title: i18n.t("literature.attach.couldNotVerify"),
        subtitle: i18n.t("literature.attach.noIdentifierInFile"),
        message: i18n.t("literature.attach.targetUnverifiedMsg"),
      };
    default:
      return { title: i18n.t("literature.attach.attachPdf"), subtitle: "", message: "" };
  }
}

function ConflictDetails({ conflict }: { conflict: LiteratureAttachLocalPdfConflict }) {
  const { t } = useTranslation();

  if (conflict.kind === "sha_duplicate" || conflict.kind === "identifier_duplicate") {
    const otherHasPdf = Boolean(conflict.otherPaper.pdf_path || conflict.otherPaper.zotero_key);
    return (
      <div className="text-[length:var(--font-size-12)] text-muted-foreground space-y-1">
        <p>
          <span className="text-foreground/90 font-mono">{conflict.otherPaper.bibkey}</span>
          {conflict.otherPaper.title ? (
            <span className="text-muted-foreground"> — {conflict.otherPaper.title}</span>
          ) : null}
        </p>
        {conflict.kind === "identifier_duplicate" ? (
          <p>
            {otherHasPdf
              ? t("literature.attach.otherHasPdf")
              : t("literature.attach.otherNoPdf")}
          </p>
        ) : null}
      </div>
    );
  }

  if (conflict.kind === "target_mismatch") {
    const entry = formatIdentifierBrief(
      normalizeLiteratureIdentifiers({
        doi: conflict.entryDoi,
        arxivId: conflict.entryArxivId,
      }),
    );
    const pdf = formatIdentifierBrief(
      normalizeLiteratureIdentifiers({
        doi: conflict.pdfDoi,
        arxivId: conflict.pdfArxivId,
      }),
    );
    return (
      <dl className="grid grid-cols-2 gap-2 text-[length:var(--font-size-12)]">
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <dt className="text-[length:var(--font-dialog-label)] text-muted-foreground mb-1">
            {t("literature.attach.thisEntry")}
          </dt>
          <dd className="font-mono text-foreground/90 break-all leading-snug">{entry}</dd>
        </div>
        <div className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2">
          <dt className="text-[length:var(--font-dialog-label)] text-warning mb-1">
            {t("literature.attach.pdfFile")}
          </dt>
          <dd className="font-mono text-foreground/90 break-all leading-snug">{pdf}</dd>
        </div>
      </dl>
    );
  }

  if (conflict.kind === "target_unverified") {
    const entry = formatIdentifierBrief(
      normalizeLiteratureIdentifiers({
        doi: conflict.entryDoi,
        arxivId: conflict.entryArxivId,
      }),
    );
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[length:var(--font-size-12)]">
        <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mb-1">
          {t("literature.attach.entryIdentifier")}
        </p>
        <p className="font-mono text-foreground/90 break-all">{entry}</p>
      </div>
    );
  }

  return null;
}

export function LiteraturePdfAttachConflictDialog({
  attach,
}: {
  attach: LiteraturePdfAttachHandle;
}) {
  const { t } = useTranslation();
  const { conflict, clearConflict, conflictActions } = attach;
  if (!conflict) return null;

  const copy = conflictCopy(conflict);
  const other = "otherPaper" in conflict ? conflict.otherPaper : undefined;
  const otherHasPdf = Boolean(other?.pdf_path || other?.zotero_key);
  const canAttachAnyway =
    conflict.kind === "identifier_duplicate" ||
    conflict.kind === "target_mismatch" ||
    conflict.kind === "target_unverified";

  return (
    <Dialog open onOpenChange={(open) => !open && clearConflict()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">{copy.title}</DialogTitle>
          {copy.subtitle ? (
            <DialogDescription className="text-[length:var(--font-size-13)]">
              {copy.subtitle}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-3">
          <div
            className={cn(
              "rounded-md border px-3 py-2.5 text-[length:var(--font-size-12)] leading-relaxed",
              calloutClass(conflict.kind),
            )}
          >
            {copy.message}
          </div>
          <ConflictDetails conflict={conflict} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shadow-none"
            onClick={clearConflict}
          >
            {t("common.cancel")}
          </Button>
          {canAttachAnyway ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shadow-none"
              onClick={() => void conflictActions.handleAttachAnyway()}
            >
              {t("literature.attach.attachAnyway")}
            </Button>
          ) : null}
          {conflict.kind === "identifier_duplicate" && !otherHasPdf ? (
            <Button
              type="button"
              size="sm"
              className="shadow-none"
              onClick={() => void conflictActions.handleAttachToOther()}
            >
              {t("literature.attach.attachToBibkey", { bibkey: conflict.otherPaper.bibkey })}
            </Button>
          ) : null}
          {other ? (
            <Button
              type="button"
              size="sm"
              className="shadow-none"
              onClick={conflictActions.handleOpenOther}
            >
              {t("literature.attach.openBibkey", { bibkey: other.bibkey })}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

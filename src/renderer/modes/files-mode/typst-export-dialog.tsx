import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogBodyTextClass,
  dialogFieldLabelClass,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TypstCliFormat } from "@shared/compile/typst-format";
import { TYPST_CLI_FORMATS, typstVisibleExportDirRel } from "@shared/compile/typst-format";
import { exportTypst } from "@/stores/typst-live-store";
import { useDocumentStore } from "@/stores/document-store";
import { openProjectFileFromChat } from "@/lib/files/open-project-file";

const FORMAT_LABEL: Record<TypstCliFormat, string> = {
  pdf: "PDF",
  png: "PNG",
  svg: "SVG",
  html: "HTML",
};

export function TypstExportDialog({
  open,
  onOpenChange,
  compileRoot,
  fileId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compileRoot: string;
  fileId?: string;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<TypstCliFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dest = typstVisibleExportDirRel(compileRoot);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    if (fileId) useDocumentStore.getState().setActiveFile(fileId);
    try {
      const result = await exportTypst(format);
      if (!result.ok) {
        setError(result.error || t("modes.files.typstExportFailed"));
        return;
      }
      const files = result.files ?? [];
      onOpenChange(false);
      await useDocumentStore.getState().refreshFiles();
      if (files[0]) await openProjectFileFromChat(files[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modes.files.typstExportTitle")}</DialogTitle>
          <DialogDescription>{t("modes.files.typstExportHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className={dialogFieldLabelClass}>{t("modes.files.typstExportFormat")}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {TYPST_CLI_FORMATS.map((item) => (
              <Button
                key={item}
                type="button"
                size="xs"
                variant={format === item ? "default" : "outline"}
                disabled={busy}
                onClick={() => setFormat(item)}
              >
                {FORMAT_LABEL[item]}
              </Button>
            ))}
          </div>
          <p className={cn(dialogBodyTextClass, "text-muted-foreground")}>
            {t("modes.files.typstExportDest", { path: dest })}
          </p>
          {error ? (
            <p className={cn(dialogBodyTextClass, "text-destructive")}>{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="xs" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button size="xs" disabled={busy} onClick={() => void handleExport()}>
            {busy ? (
              <>
                <Loader2Icon className="size-3 animate-spin" />
                {t("modes.files.typstExporting")}
              </>
            ) : (
              t("modes.files.typstExportAction")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

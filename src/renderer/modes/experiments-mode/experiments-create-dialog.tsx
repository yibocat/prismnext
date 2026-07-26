/**
 * Dialog to create a new experiment (Station 1).
 * Calls store.createExperiment → IPC experiment:create.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useExperimentStore } from "@/stores/experiment-store";
import { useExperimentProjectRoot } from "./experiments-project-root";

export function ExperimentsCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const createExperiment = useExperimentStore((s) => s.createExperiment);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!projectRoot || !trimmed || busy) return;
    setBusy(true);
    try {
      const id = await createExperiment(projectRoot, trimmed);
      if (!id) {
        const err = useExperimentStore.getState().error;
        toast.error(err || t("experiments.create.failed"));
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }, [busy, createExperiment, onOpenChange, projectRoot, t, title]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("experiments.create.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("experiments.create.desc")}
        </p>
        <Input
          autoFocus
          value={title}
          disabled={busy}
          placeholder={t("experiments.create.placeholder")}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || !title.trim() || !projectRoot}
            onClick={() => void handleSubmit()}
          >
            {busy ? t("experiments.create.creating") : t("experiments.create.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

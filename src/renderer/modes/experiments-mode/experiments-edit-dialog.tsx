/**
 * Dialog to create / edit research-brief links on an experiment
 * (hypothesis, RQ, linked canonical brief sections).
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
import { Textarea } from "@/components/ui/textarea";
import { readResearchBrief } from "@/lib/files/open-research-brief";
import { useExperimentStore } from "@/stores/experiment-store";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { ExperimentsBriefSectionPicker } from "./experiments-brief-section-picker";
import { openExperimentResearchBrief } from "./experiments-open-brief";
import type { ExperimentBriefLinks, ExperimentMeta } from "../../../shared/experiments/log";
import {
  experimentExcerptsFromBriefSections,
  type ResearchBriefSection,
} from "../../../shared/research/brief";

export function ExperimentsBriefEditDialog({
  meta,
  open,
  onOpenChange,
}: {
  meta: ExperimentMeta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const updateExperiment = useExperimentStore((s) => s.updateExperiment);
  const [hypothesis, setHypothesis] = useState("");
  const [rq, setRq] = useState("");
  const [sections, setSections] = useState<ResearchBriefSection[]>([]);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    if (!open) return;
    const links = meta.briefLinks;
    setHypothesis(links?.hypothesisExcerpt ?? "");
    setRq(links?.researchQuestionExcerpt ?? "");
    setSections((links?.sections ?? []) as ResearchBriefSection[]);
    setBusy(false);
    setFilling(false);
  }, [meta, open]);

  const handleFillFromBrief = useCallback(async () => {
    if (!projectRoot || filling) return;
    setFilling(true);
    try {
      const brief = await readResearchBrief(projectRoot);
      const { hypothesisExcerpt, researchQuestionExcerpt } =
        experimentExcerptsFromBriefSections(brief.sections ?? {});
      if (!hypothesisExcerpt && !researchQuestionExcerpt) {
        toast.message(t("experiments.brief.fillEmpty"));
        return;
      }
      if (hypothesisExcerpt) setHypothesis(hypothesisExcerpt);
      if (researchQuestionExcerpt) setRq(researchQuestionExcerpt);
      toast.success(t("experiments.brief.fillDone"));
    } catch {
      toast.error(t("experiments.brief.fillFailed"));
    } finally {
      setFilling(false);
    }
  }, [filling, projectRoot, t]);

  const handleSubmit = useCallback(async () => {
    if (!projectRoot || busy) return;
    setBusy(true);
    const briefLinks: ExperimentBriefLinks = {
      hypothesisExcerpt: hypothesis.trim() || undefined,
      researchQuestionExcerpt: rq.trim() || undefined,
      sections: sections.length > 0 ? sections : undefined,
    };
    try {
      const ok = await updateExperiment(projectRoot, meta.id, { briefLinks });
      if (!ok) {
        const err = useExperimentStore.getState().error;
        toast.error(err || t("experiments.brief.editFailed"));
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }, [busy, hypothesis, meta.id, onOpenChange, projectRoot, rq, sections, t, updateExperiment]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("experiments.brief.editTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("experiments.brief.editDesc")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={busy || filling || !projectRoot}
            onClick={() => void handleFillFromBrief()}
          >
            {filling ? t("experiments.brief.filling") : t("experiments.brief.fillFromBrief")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            className="text-muted-foreground"
            onClick={() => void openExperimentResearchBrief(sections[0])}
          >
            {t("experiments.brief.openBrief")}
          </Button>
        </div>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("experiments.brief.hypothesisLabel")}
            </label>
            <Textarea
              autoFocus
              value={hypothesis}
              disabled={busy}
              rows={3}
              placeholder={t("experiments.brief.hypothesisPlaceholder")}
              onChange={(e) => setHypothesis(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("experiments.brief.rqLabel")}
            </label>
            <Textarea
              value={rq}
              disabled={busy}
              rows={2}
              placeholder={t("experiments.brief.rqPlaceholder")}
              onChange={(e) => setRq(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("experiments.brief.sectionsLabel")}
            </label>
            <ExperimentsBriefSectionPicker
              selected={sections}
              onChange={setSections}
              disabled={busy}
            />
          </div>
        </div>
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
            disabled={busy || !projectRoot}
            onClick={() => void handleSubmit()}
          >
            {busy
              ? t("common.saving", { defaultValue: "Saving…" })
              : t("common.save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

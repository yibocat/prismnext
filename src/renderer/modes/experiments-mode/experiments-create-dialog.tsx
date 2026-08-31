/**
 * Dialog to create a new experiment.
 * Title + optional tags + research brief fields (hypothesis / RQ / sections).
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
import { Textarea } from "@/components/ui/textarea";
import { SETTINGS_FORM_INPUT, SETTINGS_FORM_TEXTAREA } from "@/components/modules/settings/settings-tokens";
import { readResearchBrief } from "@/lib/files/open-research-brief";
import { useExperimentStore } from "@/stores/experiment-store";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { ExperimentsBriefSectionPicker } from "./experiments-brief-section-picker";
import {
  experimentExcerptsFromBriefSections,
  type ResearchBriefSection,
} from "../../../shared/research/brief";

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
  const [tagsInput, setTagsInput] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [rq, setRq] = useState("");
  const [sections, setSections] = useState<ResearchBriefSection[]>([]);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setTagsInput("");
      setHypothesis("");
      setRq("");
      setSections([]);
      setBusy(false);
      setFilling(false);
    }
  }, [open]);

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
    const trimmedTitle = title.trim();
    if (!projectRoot || !trimmedTitle || busy) return;
    setBusy(true);

    const parsedTags = tagsInput
      .split(/[,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const hasBrief =
      Boolean(hypothesis.trim()) || Boolean(rq.trim()) || sections.length > 0;

    try {
      const id = await createExperiment(projectRoot, trimmedTitle, {
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        briefLinks: hasBrief
          ? {
              hypothesisExcerpt: hypothesis.trim() || undefined,
              researchQuestionExcerpt: rq.trim() || undefined,
              sections: sections.length > 0 ? sections : undefined,
            }
          : undefined,
      });
      if (!id) {
        const err = useExperimentStore.getState().error;
        toast.error(err || t("experiments.create.failed"));
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    createExperiment,
    hypothesis,
    onOpenChange,
    projectRoot,
    rq,
    sections,
    t,
    tagsInput,
    title,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("experiments.create.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("experiments.create.desc")}
        </p>
        <div className="flex max-h-[min(70vh,32rem)] flex-col gap-3 overflow-y-auto py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("experiments.create.nameLabel")}
            </label>
            <Input
              autoFocus
              className={SETTINGS_FORM_INPUT}
              value={title}
              disabled={busy}
              placeholder={t("experiments.create.placeholder")}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("experiments.create.tagsLabel")}
            </label>
            <Input
              className={SETTINGS_FORM_INPUT}
              value={tagsInput}
              disabled={busy}
              placeholder={t("experiments.create.tagsPlaceholder")}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
                {t("experiments.brief.hypothesisLabel")}
              </label>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-6 px-1.5 text-muted-foreground"
                disabled={busy || filling || !projectRoot}
                onClick={() => void handleFillFromBrief()}
              >
                {filling ? t("experiments.brief.filling") : t("experiments.brief.fillFromBrief")}
              </Button>
            </div>
            <Textarea
              className={SETTINGS_FORM_TEXTAREA}
              value={hypothesis}
              disabled={busy}
              rows={2}
              placeholder={t("experiments.brief.hypothesisPlaceholder")}
              onChange={(e) => setHypothesis(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("experiments.brief.rqLabel")}
            </label>
            <Textarea
              className={SETTINGS_FORM_TEXTAREA}
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
            size="xs"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="xs"
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

/**
 * experiments-brief-strip — Research brief excerpts (hypothesis, RQ, linked sections).
 * Editable via dialog; section pills + Open Brief jump to the Research Brief panel.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { ExperimentBriefLinks, ExperimentMeta } from "../../../shared/experiment-log";
import {
  experimentsBriefBoxClass,
  experimentsBriefSectionPillClass,
  experimentsSubsectionLabelClass,
} from "./experiments-detail-chrome";
import { ExperimentsBriefEditDialog } from "./experiments-edit-dialog";
import { openExperimentResearchBrief } from "./experiments-open-brief";

function hasContent(briefLinks: ExperimentBriefLinks | undefined): boolean {
  if (!briefLinks) return false;
  if (briefLinks.hypothesisExcerpt?.trim()) return true;
  if (briefLinks.researchQuestionExcerpt?.trim()) return true;
  if (Array.isArray(briefLinks.sections) && briefLinks.sections.some((s) => s?.trim())) {
    return true;
  }
  return false;
}

export function ExperimentsBriefStrip({
  meta,
  className,
}: {
  meta: ExperimentMeta;
  className?: string;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const briefLinks = meta.briefLinks;
  const filled = hasContent(briefLinks);

  const hypothesis = briefLinks?.hypothesisExcerpt?.trim() ?? "";
  const rq = briefLinks?.researchQuestionExcerpt?.trim() ?? "";
  const sections = Array.isArray(briefLinks?.sections)
    ? briefLinks!.sections.filter((s) => s?.trim())
    : [];

  return (
    <>
      <section
        aria-label={t("experiments.brief.excerpts")}
        className={cn(experimentsBriefBoxClass, className)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {!filled ? (
              <p className="font-sans text-[length:var(--font-size-12)] text-muted-foreground">
                {t("experiments.brief.placeholder")}
              </p>
            ) : (
              <>
                {hypothesis ? (
                  <p className="text-[length:var(--font-size-13)] italic leading-snug text-foreground/85">
                    {hypothesis}
                  </p>
                ) : null}
                {rq ? (
                  <p className="text-[length:var(--font-size-13)] leading-snug text-muted-foreground/85">
                    <span className="font-medium text-foreground/80">{t("experiments.brief.rq")}</span>{" "}
                    {rq}
                  </p>
                ) : null}
                {sections.length > 0 ? (
                  <div className="space-y-1.5">
                    <span className={experimentsSubsectionLabelClass}>
                      {t("experiments.brief.linked")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {sections.map((section) => (
                        <Hint key={section} label={t("experiments.brief.openSectionHint", { section })}>
                          <button
                            type="button"
                            className={cn(
                              experimentsBriefSectionPillClass,
                              "cursor-pointer transition-colors hover:bg-accent hover:text-foreground",
                            )}
                            onClick={() => void openExperimentResearchBrief(section)}
                          >
                            {section}
                          </button>
                        </Hint>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Hint label={t("experiments.brief.openBriefHint")}>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => void openExperimentResearchBrief(sections[0])}
              >
                <BookOpenIcon className="size-3" aria-hidden />
                <span className="text-[length:var(--font-size-11)]">
                  {t("experiments.brief.openBrief")}
                </span>
              </Button>
            </Hint>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 shrink-0 gap-1 px-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon className="size-3" aria-hidden />
              <span>
                {filled
                  ? t("common.edit", { defaultValue: "Edit" })
                  : t("experiments.brief.add", { defaultValue: "Add" })}
              </span>
            </Button>
          </div>
        </div>
      </section>

      <ExperimentsBriefEditDialog
        meta={meta}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

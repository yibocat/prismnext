/**
 * experiments-brief-strip — Research brief excerpts (hypothesis, RQ, linked sections).
 *
 * Rendered inside a bordered box under the experiment title. Section pills
 * (`briefLinks.sections`) are NOT the same as `meta.tags` — see detail Overview.
 */

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ExperimentBriefLinks } from "../../../shared/experiment-log";
import {
  experimentsBriefBoxClass,
  experimentsBriefSectionPillClass,
  experimentsSubsectionLabelClass,
} from "./experiments-detail-chrome";

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
  briefLinks,
  className,
}: {
  briefLinks: ExperimentBriefLinks | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!hasContent(briefLinks)) return null;

  const hypothesis = briefLinks!.hypothesisExcerpt?.trim() ?? "";
  const rq = briefLinks!.researchQuestionExcerpt?.trim() ?? "";
  const sections = Array.isArray(briefLinks!.sections)
    ? briefLinks!.sections.filter((s) => s?.trim())
    : [];

  return (
    <section
      aria-label={t("experiments.brief.excerpts")}
      className={cn(experimentsBriefBoxClass, className)}
    >
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
              <span key={section} className={experimentsBriefSectionPillClass}>
                {section}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

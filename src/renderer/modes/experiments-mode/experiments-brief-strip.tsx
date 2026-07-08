/**
 * experiments-brief-strip — Inline brief excerpt strip for the Experiments
 * mode detail view (Sprint 0.7, Task 5).
 *
 * Read-only display of `ExperimentMeta.briefLinks`:
 *   - hypothesisExcerpt        — quote block under the title
 *   - researchQuestionExcerpt  — secondary one-liner
 *   - sections[]               — pill tags
 *
 * **Graceful collapse (mandated by plan):** if `briefLinks` is entirely empty
 * (no hypothesisExcerpt, no researchQuestionExcerpt, no sections), this
 * component renders `null` — no wrapper, no padding, no dead space. The Agent
 * fill-rate of `briefLinks` is unreliable, so a dead strip is worse than
 * absence.
 *
 * The strip is otherwise purely presentational: it does not pull from any
 * store and does not own its layout container (the parent detail view
 * provides the vertical rhythm).
 */

import { QuoteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExperimentBriefLinks } from "../../../shared/experiment-log";

export interface ExperimentsBriefStripProps {
  briefLinks: ExperimentBriefLinks | undefined;
  className?: string;
}

function hasContent(links: ExperimentBriefLinks | undefined): boolean {
  if (!links) return false;
  if (links.hypothesisExcerpt && links.hypothesisExcerpt.trim()) return true;
  if (
    links.researchQuestionExcerpt &&
    links.researchQuestionExcerpt.trim()
  ) {
    return true;
  }
  if (Array.isArray(links.sections) && links.sections.length > 0) return true;
  return false;
}

export function ExperimentsBriefStrip({
  briefLinks,
  className,
}: ExperimentsBriefStripProps) {
  // Graceful collapse: no briefLinks object, or every field empty → render
  // nothing. This is the explicit contract from plan §Brief inline 摘录.
  if (!hasContent(briefLinks)) return null;

  const hypothesis = briefLinks!.hypothesisExcerpt?.trim() ?? "";
  const rq = briefLinks!.researchQuestionExcerpt?.trim() ?? "";
  const sections = Array.isArray(briefLinks!.sections)
    ? briefLinks!.sections.filter((s) => s && s.trim())
    : [];

  return (
    <section
      aria-label="Research brief excerpts"
      className={cn(
        "rounded-md border border-border/60 bg-muted/30 px-3 py-2",
        className,
      )}
    >
      {hypothesis ? (
        <blockquote className="flex gap-2 border-l-2 border-primary/40 pl-2 text-[length:var(--font-size-12)] text-foreground/85">
          <QuoteIcon
            className="mt-0.5 size-3 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
          <span className="italic">{hypothesis}</span>
        </blockquote>
      ) : null}

      {rq ? (
        <p
          className={cn(
            "text-[length:var(--font-size-12)] text-muted-foreground",
            hypothesis && "mt-1.5",
          )}
        >
          <span className="font-medium text-foreground/70">RQ:</span> {rq}
        </p>
      ) : null}

      {sections.length > 0 ? (
        <div
          className={cn(
            "flex flex-wrap gap-1",
            (hypothesis || rq) && "mt-2",
          )}
        >
          {sections.map((section) => (
            <Badge
              key={section}
              variant="secondary"
              className="text-[length:var(--font-hint)] font-normal"
            >
              {section}
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}

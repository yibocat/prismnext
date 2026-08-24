/**
 * Multi-select of canonical research-brief ## sections for experiment briefLinks.
 */
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  RESEARCH_BRIEF_SECTIONS,
  type ResearchBriefSection,
} from "../../../shared/research/brief";

export function ExperimentsBriefSectionPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (next: ResearchBriefSection[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const selectedSet = new Set(
    selected.map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  const toggle = (name: ResearchBriefSection, on: boolean) => {
    const next = RESEARCH_BRIEF_SECTIONS.filter((s) => {
      if (s === name) return on;
      return selectedSet.has(s.toLowerCase());
    });
    onChange([...next]);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[length:var(--font-size-11)] text-muted-foreground">
        {t("experiments.brief.sectionsHint")}
      </p>
      <div className="max-h-40 space-y-0.5 overflow-auto rounded-md border border-border/60 px-2 py-1.5">
        {RESEARCH_BRIEF_SECTIONS.map((name) => {
          const checked = selectedSet.has(name.toLowerCase());
          return (
            <label
              key={name}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1",
                "text-[length:var(--font-size-12)] hover:bg-muted",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => toggle(name, v === true)}
              />
              <span className="min-w-0 truncate">{name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

import { Loader2Icon } from "lucide-react";
import { extractBadgeLabel } from "../../../shared/literature/paper-extract";
import type { PaperExtractStatesByPaper } from "@/types/electron.d";
import { useLiteratureExtractStore, selectExtractProgressForPaper } from "@/stores/literature-extract-store";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  md: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  html: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  pdf: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  busy: "border-border/60 bg-muted/40 text-muted-foreground",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function LiteratureExtractBadge({
  paperId,
  statesByPaper,
  visible,
}: {
  paperId: string;
  statesByPaper: PaperExtractStatesByPaper;
  visible: boolean;
}) {
  const progress = useLiteratureExtractStore((s) =>
    selectExtractProgressForPaper(s.progressByKey, paperId),
  );
  const badge = extractBadgeLabel(statesByPaper[paperId]);
  if ((!badge && !progress) || !visible) return null;

  const title =
    progress?.message ??
    (badge?.tone === "failed"
      ? statesByPaper[paperId]?.mineru?.error ??
        statesByPaper[paperId]?.pdfjs?.error ??
        statesByPaper[paperId]?.html?.error
      : undefined);

  if (progress && !badge) {
    return (
      <span
        className={cn(
          "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-1 text-[9px] font-semibold leading-none border",
          TONE_CLASS.busy,
        )}
        title={title}
      >
        <Loader2Icon className="size-2.5 animate-spin" />
      </span>
    );
  }

  if (!badge) return null;

  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-1 text-[9px] font-semibold leading-none border",
        TONE_CLASS[badge.tone],
      )}
      title={title}
    >
      {badge.tone === "busy" ? <Loader2Icon className="size-2.5 animate-spin" /> : badge.label}
    </span>
  );
}

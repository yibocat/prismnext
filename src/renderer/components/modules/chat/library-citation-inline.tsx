import { memo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { inlineTokenClassName, INLINE_TOKEN_CLICKABLE } from "./inline-tokens/styles";
import { formatPaperMentionLabel } from "../../../../shared/literature/bibkey-utils";
import {
  openPaperInMainLibrary,
  openPaperPdfReader,
} from "@/lib/literature/open-paper-in-library";
import {
  formatLiteratureAuthorsShort,
  paperHasReadablePdf,
} from "@/modes/literature-mode/literature-format";
import { useLiteratureStore } from "@/stores/literature-store";
import { cn } from "@/lib/utils";

export function decodeLibraryCiteHref(href: string): string | null {
  if (!href.startsWith("library-cite:")) return null;
  const raw = href.slice("library-cite:".length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Library @bibkey in AI markdown — composer chip look, hover preview panel,
 * explicit Open in library / Read PDF (no click-to-open on the chip itself).
 */
export const LibraryCitationInline = memo(function LibraryCitationInline({
  bibkey,
}: {
  bibkey: string;
}) {
  const { t } = useTranslation();
  const paper = useLiteratureStore((s) =>
    s.papers.find((p) => p.bibkey === bibkey) ?? null,
  );
  const hasPdf = paper != null && paperHasReadablePdf(paper);
  const label = formatPaperMentionLabel(bibkey);
  const authorsLine = paper
    ? [formatLiteratureAuthorsShort(paper.authors), paper.year, paper.venue]
        .filter((v) => v != null && String(v).trim() !== "")
        .join(" · ")
    : "";
  const aiSummary = paper?.ai_summary?.trim() ?? "";
  const previewText = aiSummary || paper?.abstract?.trim() || "";
  const previewLabel = aiSummary
    ? t("literature.detail.aiSummary")
    : previewText
      ? t("literature.detail.abstract")
      : "";

  return (
    <HoverCard openDelay={280} closeDelay={120}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            inlineTokenClassName("literature", "max-w-[16rem]"),
            INLINE_TOKEN_CLICKABLE,
            "inline",
          )}
          data-inline-token="literature"
        >
          <BookOpenIcon className="size-[0.85em] shrink-0 text-indigo-700 dark:text-indigo-400" />
          <span className="inline min-w-0 truncate leading-[inherit]">{label}</span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        {paper ? (
          <div className="flex flex-col">
            <div className="space-y-1.5 border-b border-border/60 px-3 py-3">
              <p className="text-[length:var(--font-size-13)] font-semibold leading-snug text-foreground line-clamp-3">
                {paper.title || t("literature.detail.untitled")}
              </p>
              {authorsLine ? (
                <p className="text-[length:var(--font-size-11)] text-muted-foreground line-clamp-2">
                  {authorsLine}
                </p>
              ) : null}
              <p className="text-[length:var(--font-size-10)] text-muted-foreground/80">
                {paper.bibkey}
              </p>
            </div>
            {previewText ? (
              <div className="px-3 py-2.5">
                {previewLabel ? (
                  <p className="mb-1 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide text-muted-foreground/70">
                    {previewLabel}
                  </p>
                ) : null}
                <p className="text-[length:var(--font-size-12)] leading-relaxed text-muted-foreground line-clamp-5">
                  {previewText}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 gap-1 text-[length:var(--font-size-11)]"
                onClick={() => openPaperInMainLibrary(paper.id)}
              >
                <ExternalLinkIcon className="size-3" />
                {t("modes.literature.openInLibrary")}
              </Button>
              {hasPdf ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[length:var(--font-size-11)]"
                  onClick={() =>
                    openPaperPdfReader(paper.id, paper.title ?? paper.bibkey)
                  }
                >
                  <FileTextIcon className="size-3" />
                  {t("literature.detail.openPdf")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-3 py-3">
            <p className="text-[length:var(--font-size-13)] font-medium text-foreground">
              {t("chat.libraryCite.notInLibrary")}
            </p>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              {t("chat.libraryCite.notFoundBody", { bibkey })}
            </p>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
});

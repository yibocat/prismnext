import { memo } from "react";
import { BookOpenIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { inlineTokenClassName } from "./inline-tokens/styles";
import { useLiteratureStore } from "@/stores/literature-store";
import {
  formatLiteratureAuthorsShort,
  paperHasReadablePdf,
} from "@/modes/literature-mode/literature-format";
import {
  openPaperInMainLibrary,
  openPaperPdfReader,
} from "@/lib/literature/open-paper-in-library";
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

export const LibraryCitationInline = memo(function LibraryCitationInline({
  bibkey,
}: {
  bibkey: string;
}) {
  const paper = useLiteratureStore((s) =>
    s.papers.find((p) => p.bibkey === bibkey) ?? null,
  );
  const hasPdf = paper != null && paperHasReadablePdf(paper);
  const authorsLine = paper
    ? [formatLiteratureAuthorsShort(paper.authors), paper.year, paper.venue]
        .filter((v) => v != null && String(v).trim() !== "")
        .join(" · ")
    : "";
  const aiSummary = paper?.ai_summary?.trim() ?? "";
  const previewText = aiSummary || paper?.abstract?.trim() || "";
  const previewLabel = aiSummary ? "AI summary" : previewText ? "Abstract" : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={paper?.title ?? `Library cite key: ${bibkey}`}
          data-inline-token="literature"
          className={cn(
            inlineTokenClassName("literature", "cursor-pointer max-w-[16rem]"),
            "hover:brightness-95 dark:hover:brightness-110",
          )}
        >
          <BookOpenIcon className="size-3 shrink-0" />
          <span className="min-w-0 truncate font-mono">@{bibkey}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        {paper ? (
          <div className="flex flex-col">
            <div className="space-y-1.5 border-b border-border/60 px-3 py-3">
              <p className="text-[length:var(--font-size-13)] font-semibold leading-snug text-foreground line-clamp-3">
                {paper.title || "Untitled"}
              </p>
              {authorsLine ? (
                <p className="text-[length:var(--font-size-11)] text-muted-foreground line-clamp-2">
                  {authorsLine}
                </p>
              ) : null}
              <p className="font-mono text-[length:var(--font-size-10)] text-muted-foreground/80">
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
                Open in library
              </Button>
              {hasPdf ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[length:var(--font-size-11)]"
                  onClick={() => openPaperPdfReader(paper.id, paper.title ?? paper.bibkey)}
                >
                  <FileTextIcon className="size-3" />
                  Read PDF
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-3 py-3">
            <p className="text-[length:var(--font-size-13)] font-medium text-foreground">
              Not in library
            </p>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              No paper with cite key{" "}
              <span className="font-mono text-foreground">@{bibkey}</span>{" "}
              was found. Check the key or add the paper to your library.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

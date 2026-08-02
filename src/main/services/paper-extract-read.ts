import {
  EXTRACT_SOURCE_PRIORITY,
  PAPER_EXTRACT_ACTION_LABEL,
  pickBestReadySource,
  type PaperExtractSource,
  type PaperExtractSourcePreference,
  type PaperExtractState,
} from "../../shared/paper-extract";
import {
  filterMarkdownByQuery,
  parsePageSpec,
  sliceMarkdownByPages,
  truncateMarkdown,
} from "../../shared/paper-extract-slice";
import {
  listExtractFigurePaths,
  markdownHasExtractFigures,
  resolveLibraryFigurePath,
  rewritePaperExtractImageSrcs,
} from "../../shared/paper-extract-images";
import { getPaperByBibkey } from "./literature-service";
import {
  enqueuePaperExtract,
  notifyAgentExtractRequested,
} from "./literature-extract-queue";
import {
  getPaperExtractState,
  listPaperExtractStates,
  readExtractMarkdown,
} from "./paper-extract-db";

export interface ReadPdfContentArgs {
  projectRoot: string;
  bibkey: string;
  pages?: string;
  query?: string;
  source?: PaperExtractSourcePreference;
  force?: boolean;
  /** Agent-driven extraction wait (ms). */
  waitTimeoutMs?: number;
  initiatedBy?: "user" | "agent";
}

export interface ReadPdfContentResult {
  bibkey: string;
  paperId: string;
  source?: PaperExtractSource;
  cached?: boolean;
  pages?: string;
  markdown?: string;
  truncated?: boolean;
  /** Extract includes embeddable figure image paths. */
  hasFigures?: boolean;
  /** Project-relative figure paths present in markdown (when hasFigures). */
  figures?: string[];
  not_extracted?: boolean;
  extracting?: boolean;
  hint?: string;
  error?: string;
}

function defaultSourceToEnqueue(
  preference: PaperExtractSourcePreference,
  tokenPresent: boolean,
): PaperExtractSource {
  if (preference === "auto") {
    return tokenPresent ? "mineru" : "pdfjs";
  }
  return preference;
}

export async function readPaperPdfContent(
  args: ReadPdfContentArgs,
  mineruTokenPresent: boolean,
): Promise<ReadPdfContentResult> {
  const bibkey = args.bibkey.trim();
  const paper = getPaperByBibkey(args.projectRoot, bibkey);
  if (!paper) {
    return {
      bibkey,
      paperId: "",
      error: `Paper not found in library: ${bibkey}`,
      hint: "Copy the exact Cite key from Literature panel (case-sensitive).",
    };
  }

  const preference = args.source ?? "auto";
  const states = listPaperExtractStates(args.projectRoot, [paper.id])[paper.id];
  let readySource = pickBestReadySource(states, preference);

  if (!readySource && args.force) {
    const enqueueSource = defaultSourceToEnqueue(preference, mineruTokenPresent);
    if (args.initiatedBy === "agent") {
      notifyAgentExtractRequested({
        projectRoot: args.projectRoot,
        paperId: paper.id,
        bibkey: paper.bibkey,
        title: paper.title,
        source: enqueueSource,
      });
    }
    try {
      const waited = await enqueuePaperExtract(
        args.projectRoot,
        paper.id,
        enqueueSource,
        {
          force: true,
          waitForReady: true,
          waitTimeoutMs: args.waitTimeoutMs ?? 5 * 60_000,
        },
      );
      if (waited && waited.status === "ready") {
        readySource = enqueueSource;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        bibkey,
        paperId: paper.id,
        not_extracted: true,
        error: message,
        hint: "Extraction failed. Try Extract in Literature panel or built-in pdfjs.",
      };
    }
  }

  if (!readySource) {
    const statusBits = EXTRACT_SOURCE_PRIORITY.map((s) => {
      const st = states?.[s]?.status;
      return st && st !== "idle" ? `${s}:${st}` : null;
    }).filter(Boolean);
    const busy = statusBits.some((b) => b?.includes("queued") || b?.includes("extracting"));
    return {
      bibkey,
      paperId: paper.id,
      not_extracted: !busy,
      extracting: busy,
      hint: busy
        ? "PDF text extraction is in progress — ask again shortly."
        : `Paper body not extracted yet. Open Literature → ${PAPER_EXTRACT_ACTION_LABEL}, or call again with force=true to start extraction (MinerU uploads PDF to cloud when configured).`,
    };
  }

  const state: PaperExtractState | null = getPaperExtractState(
    args.projectRoot,
    paper.id,
    readySource,
  );
  if (!state || state.status !== "ready") {
    return {
      bibkey,
      paperId: paper.id,
      not_extracted: true,
      hint: "Extract state changed — retry.",
    };
  }

  let markdown = readExtractMarkdown(args.projectRoot, state);
  if (!markdown) {
    return {
      bibkey,
      paperId: paper.id,
      not_extracted: true,
      hint: "Cached extract file missing — re-extract from Literature panel.",
    };
  }

  const totalPages = state.pages ?? 0;
  if (args.pages?.trim() && totalPages > 0) {
    const pageNums = parsePageSpec(args.pages, totalPages);
    if (pageNums) markdown = sliceMarkdownByPages(markdown, pageNums);
  }
  if (args.query?.trim()) {
    markdown = filterMarkdownByQuery(markdown, args.query);
  }
  const { text, truncated } = truncateMarkdown(markdown);
  const rewritten = rewritePaperExtractImageSrcs(text, paper.id);
  const hasFigures = markdownHasExtractFigures(rewritten);
  const figures = hasFigures
    ? listExtractFigurePaths(rewritten).map((p) =>
        p.startsWith("images/") ? resolveLibraryFigurePath(paper.id, p) : p,
      )
    : undefined;

  let hint =
    "When citing in chat, use [@bibkey] with this exact bibkey; add p.X when quoting specific pages. Use pages= for narrower ranges.";
  if (hasFigures) {
    hint +=
      " Figures may be embedded in your reply with `![caption](path)` (paths from this output) or compact `[@bibkey|images/fig-0.png]` — optional; use when a chart or diagram helps.";
  }

  return {
    bibkey,
    paperId: paper.id,
    source: readySource,
    cached: true,
    pages: args.pages,
    markdown: rewritten,
    truncated,
    hasFigures,
    figures,
    hint,
  };
}

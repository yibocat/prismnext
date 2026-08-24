import { normalizeArxivId, normalizeDoi } from "../../../shared/literature/doi-utils";
import {
  bibliographicToCslJson,
  normalizeCslPageRange,
} from "../../../shared/bibliographic-metadata/helpers";
import type { BibliographicMetadata } from "../../../shared/bibliographic-metadata/types";
import { parseBibTeX, patchCslJsonBibkey } from "../../lib/bibtex-parse";

/** Fields needed to build `csl_json` for a synced Zotero library item. */
export interface ZoteroPaperCslInput {
  title: string;
  itemType: string;
  authorsJson: string | null;
  editorsJson: string | null;
  year: number | null;
  abstract: string | null;
  doi?: string;
  arxivId: string | null;
  venue: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  url: string | null;
  language: string | null;
  series: string | null;
  proceedingsTitle: string | null;
  journalAbbreviation: string | null;
}

const ZOTERO_ITEM_TYPE_TO_CSL: Record<string, string> = {
  journalArticle: "article-journal",
  magazineArticle: "article-magazine",
  newspaperArticle: "article-newspaper",
  conferencePaper: "paper-conference",
  book: "book",
  bookSection: "chapter",
  thesis: "thesis",
  report: "report",
  manuscript: "manuscript",
  patent: "patent",
  webpage: "webpage",
  blogPost: "post-weblog",
  encyclopediaArticle: "entry-encyclopedia",
  dictionaryEntry: "entry-dictionary",
  document: "document",
  artwork: "graphic",
  audioRecording: "song",
  film: "motion_picture",
  interview: "interview",
  presentation: "speech",
  map: "map",
  statute: "legislation",
  case: "legal_case",
  bill: "legislation",
  hearing: "speech",
  forumPost: "post",
  tvBroadcast: "broadcast",
  radioBroadcast: "broadcast",
  videoRecording: "motion_picture",
  instantMessage: "personal-communication",
  email: "personal-communication",
  letter: "personal-communication",
};

function zoteroItemTypeToCsl(itemType: string): string {
  return ZOTERO_ITEM_TYPE_TO_CSL[itemType] ?? "article";
}

/** Build canonical `csl_json` for a synced Zotero item (BBT BibTeX preferred). */
export function buildZoteroPaperCslJson(
  item: ZoteroPaperCslInput,
  options: { bibkey: string; rawBibtex?: string | null },
): string | null {
  const raw = options.rawBibtex?.trim();
  if (raw) {
    const entries = parseBibTeX(raw);
    if (entries[0]?.cslJson) {
      let json = patchCslJsonBibkey(entries[0].cslJson, options.bibkey);
      try {
        const csl = JSON.parse(json) as Record<string, unknown>;
        if (typeof csl.page === "string") {
          csl.page = normalizeCslPageRange(csl.page);
          json = JSON.stringify(csl);
        }
      } catch {
        // keep patched json
      }
      return json;
    }
  }

  const proceedings = item.proceedingsTitle?.trim() || null;
  const venue = item.venue?.trim() || null;
  const meta: BibliographicMetadata = {
    title: item.title,
    authors: item.authorsJson,
    editors: item.editorsJson,
    year: item.year,
    abstract: item.abstract,
    doi: item.doi ? normalizeDoi(item.doi) : null,
    arxiv_id: item.arxivId,
    venue,
    type: zoteroItemTypeToCsl(item.itemType),
    source: "zotero",
    volume: item.volume,
    issue: item.issue,
    page: item.pages ? normalizeCslPageRange(item.pages) : null,
    publisher: item.publisher,
    url: item.url,
    language: item.language,
    containerTitleShort: item.journalAbbreviation,
    event: proceedings,
    note: item.series ? `Series: ${item.series}` : null,
  };

  return patchCslJsonBibkey(bibliographicToCslJson(meta), options.bibkey);
}

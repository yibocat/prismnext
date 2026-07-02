import { normalizeLiteratureIdentifiers } from "./literature-pdf-identity";

/** Minimal library row fields used to link staged citations. */
export type LibraryPaperLinkTarget = {
  id: string;
  bibkey: string;
  doi?: string | null;
  arxiv_id?: string | null;
};

export type StagedCitationLinkSource = {
  doi?: string | null;
  arxivId?: string | null;
};

/** True when normalized DOI and/or arXiv (incl. 10.48550/arXiv.* crosswalk) refer to the same work. */
export function literatureIdentitiesMatch(
  staged: StagedCitationLinkSource,
  paper: LibraryPaperLinkTarget,
): boolean {
  const a = normalizeLiteratureIdentifiers(staged);
  const b = normalizeLiteratureIdentifiers(paper);
  if (!a.doi && !a.arxivId) return false;
  if (a.doi && b.doi && a.doi === b.doi) return true;
  if (a.arxivId && b.arxivId && a.arxivId === b.arxivId) return true;
  return false;
}

export function buildLibraryIdentityIndex(
  papers: readonly LibraryPaperLinkTarget[],
): Map<string, LibraryPaperLinkTarget> {
  const index = new Map<string, LibraryPaperLinkTarget>();
  for (const paper of papers) {
    const ids = normalizeLiteratureIdentifiers(paper);
    if (ids.doi && !index.has(`doi:${ids.doi}`)) index.set(`doi:${ids.doi}`, paper);
    if (ids.arxivId && !index.has(`arxiv:${ids.arxivId}`)) index.set(`arxiv:${ids.arxivId}`, paper);
  }
  return index;
}

export function findLibraryPaperInIdentityIndex(
  staged: StagedCitationLinkSource,
  index: Map<string, LibraryPaperLinkTarget>,
): LibraryPaperLinkTarget | undefined {
  const ids = normalizeLiteratureIdentifiers(staged);
  if (ids.doi) {
    const byDoi = index.get(`doi:${ids.doi}`);
    if (byDoi) return byDoi;
  }
  if (ids.arxivId) {
    const byArxiv = index.get(`arxiv:${ids.arxivId}`);
    if (byArxiv) return byArxiv;
  }
  return undefined;
}

export function findLibraryPaperForStagedCitation(
  staged: StagedCitationLinkSource,
  papers: readonly LibraryPaperLinkTarget[],
): LibraryPaperLinkTarget | undefined {
  if (!staged.doi && !staged.arxivId) return undefined;
  const index = buildLibraryIdentityIndex(papers);
  return findLibraryPaperInIdentityIndex(staged, index);
}

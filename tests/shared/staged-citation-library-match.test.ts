import { describe, expect, it } from "vitest";
import {
  buildLibraryIdentityIndex,
  findLibraryPaperForStagedCitation,
  findLibraryPaperInIdentityIndex,
  literatureIdentitiesMatch,
} from "../../src/shared/literature/staged-citation-library-match";

describe("staged-citation-library-match", () => {
  const paperByDoi = {
    id: "p-doi",
    bibkey: "smith2024",
    doi: "10.1038/nature12345",
    arxiv_id: null,
  };

  const paperByArxiv = {
    id: "p-arxiv",
    bibkey: "jones2023",
    doi: null,
    arxiv_id: "2301.00001",
  };

  const paperArxivDoi = {
    id: "p-arxiv-doi",
    bibkey: "lee2022",
    doi: "10.48550/arXiv.2301.00002",
    arxiv_id: null,
  };

  it("matches staged DOI to library DOI", () => {
    expect(
      literatureIdentitiesMatch({ doi: "10.1038/nature12345", arxivId: null }, paperByDoi),
    ).toBe(true);
  });

  it("matches staged arXiv DOI to library arxiv_id", () => {
    expect(
      literatureIdentitiesMatch(
        { doi: "10.48550/arXiv.2301.00002", arxivId: null },
        { id: "x", bibkey: "x", doi: null, arxiv_id: "2301.00002" },
      ),
    ).toBe(true);
  });

  it("matches staged arxivId to library arxiv DOI", () => {
    expect(
      literatureIdentitiesMatch({ doi: null, arxivId: "2301.00002" }, paperArxivDoi),
    ).toBe(true);
  });

  it("finds paper via identity index crosswalk", () => {
    const index = buildLibraryIdentityIndex([paperByArxiv, paperArxivDoi]);
    expect(findLibraryPaperInIdentityIndex({ doi: null, arxivId: "2301.00002" }, index)?.id).toBe(
      "p-arxiv-doi",
    );
  });

  it("returns undefined when staged citation has no identifiers", () => {
    expect(findLibraryPaperForStagedCitation({ doi: null, arxivId: null }, [paperByDoi])).toBe(
      undefined,
    );
  });

  it("does not match unrelated identifiers", () => {
    expect(
      literatureIdentitiesMatch({ doi: "10.1038/other", arxivId: null }, paperByDoi),
    ).toBe(false);
  });
});

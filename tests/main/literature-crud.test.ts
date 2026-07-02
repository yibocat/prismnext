import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCollection,
  createPaper,
  deletePaper,
  findExistingByIdentifier,
  getPaper,
  importBibTeX,
  listPapers,
  updatePaper,
  mapPaperForRenderer,
} from "../../src/main/services/literature-service";
import { bibliographicToCslJson } from "../../src/shared/bibliographic-metadata/helpers";

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-lit-"));
}

describe("literature CRUD", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("creates, updates, and deletes a paper", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const created = createPaper(projectRoot, { title: "Test Paper", venue: "Journal A" });
    expect(created.paper.title).toBe("Test Paper");
    expect(created.paper.venue).toBe("Journal A");
    expect(listPapers(projectRoot).length).toBe(1);

    const updated = updatePaper(projectRoot, created.paper.id, {
      title: "Updated Title",
      year: 2024,
      authors: "Smith, John",
    });
    expect(updated.title).toBe("Updated Title");
    expect(updated.year).toBe(2024);
    expect(updated.authors).toBe("Smith, John");

    const withType = updatePaper(projectRoot, created.paper.id, {
      type: "inproceedings",
      isbn: "978-0-123456-78-9",
    });
    expect(withType.type).toBe("inproceedings");
    expect(withType.isbn).toBe("978-0-123456-78-9");
    expect(getPaper(projectRoot, created.paper.id)?.type).toBe("inproceedings");

    const tagged = updatePaper(projectRoot, created.paper.id, {
      tags: ["To Read", "World Model", "to read"],
    });
    expect(tagged.tags).toEqual(JSON.stringify(["To Read", "World Model"]));
    expect(mapPaperForRenderer(tagged).tags).toEqual(["To Read", "World Model"]);

    deletePaper(projectRoot, created.paper.id);
    expect(listPapers(projectRoot).length).toBe(0);
    expect(getPaper(projectRoot, created.paper.id)).toBeNull();
  });

  it("findExistingByIdentifier matches by DOI or arXiv", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const a = createPaper(projectRoot, { title: "A", doi: "10.1109/test.2024.001" });
    const b = createPaper(projectRoot, { title: "B", arxiv_id: "2312.00726" });

    expect(findExistingByIdentifier(projectRoot, { doi: "10.1109/test.2024.001" })).toEqual({
      paperId: a.paper.id,
      bibkey: a.paper.bibkey,
    });
    expect(findExistingByIdentifier(projectRoot, { arxivId: "2312.00726" })).toEqual({
      paperId: b.paper.id,
      bibkey: b.paper.bibkey,
    });
    expect(findExistingByIdentifier(projectRoot, { doi: "10.9999/missing" })).toBeNull();
    expect(findExistingByIdentifier(projectRoot, {})).toBeNull();
  });

  it("rejects duplicate bibkey on update", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const a = createPaper(projectRoot, { title: "Paper A" });
    const b = createPaper(projectRoot, { title: "Paper B" });

    expect(() => updatePaper(projectRoot, b.paper.id, { bibkey: a.paper.bibkey })).toThrow(/already in use/);
  });

  it("enriches existing entry when DOI already in library", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const first = createPaper(projectRoot, {
      title: "Placeholder from PDF",
      doi: "10.1016/j.asoc.2025.113036",
    });
    expect(first.created).toBe(true);
    expect(first.paper.venue).toBeNull();

    const second = createPaper(projectRoot, {
      title: "Full title from catalog",
      doi: "10.1016/j.asoc.2025.113036",
      venue: "Applied Soft Computing",
      year: 2025,
    });
    expect(second.created).toBe(false);
    expect(second.paper.id).toBe(first.paper.id);
    expect(second.paper.venue).toBe("Applied Soft Computing");
    expect(second.paper.year).toBe(2025);
  });

  it("createCollection stores nested local collections without zotero_key", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    fs.mkdirSync(path.join(projectRoot, ".prismnext", "library"), { recursive: true });

    const parent = createCollection(projectRoot, "Reading list");
    const child = createCollection(projectRoot, "To read", parent.id);

    expect(parent.zotero_key).toBeNull();
    expect(child.zotero_key).toBeNull();
    expect(child.parent_id).toBe(parent.id);
  });

  it("persists csl_json when creating a paper", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const cslJson = bibliographicToCslJson({
      title: "Nature Paper",
      authors: '[{"family":"Smith","given":"John"}]',
      year: 2024,
      abstract: null,
      doi: "10.1038/test",
      arxiv_id: null,
      venue: "Nature",
      type: "article-journal",
      source: "crossref",
      volume: "521",
      page: "1--12",
    });

    const created = createPaper(projectRoot, { title: "Nature Paper", csl_json: cslJson });
    const stored = getPaper(projectRoot, created.paper.id);
    expect(stored?.csl_json).toBeTruthy();
    const csl = JSON.parse(stored!.csl_json!) as Record<string, unknown>;
    expect(csl.volume).toBe("521");
    expect(csl.page).toBe("1--12");
  });

  it("imports BibTeX with extended csl_json", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const result = await importBibTeX(
      projectRoot,
      `@article{import2024,
        title={Imported Article},
        author={Doe, Jane},
        journal={IEEE TPAMI},
        year={2024},
        volume={46},
        number={3},
        pages={100-120}
      }`,
    );
    expect(result.imported).toBe(1);
    const paper = listPapers(projectRoot)[0]!;
    expect(paper.csl_json).toBeTruthy();
    const csl = JSON.parse(paper.csl_json!) as Record<string, unknown>;
    expect(csl.volume).toBe("46");
    expect(csl.issue).toBe("3");
  });
});

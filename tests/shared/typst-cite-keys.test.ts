import { describe, expect, it } from "vitest";
import {
  extractCiteKeysFromTypst,
  extractTypstBibliographyRel,
} from "../../src/shared/literature/typst-cite-keys";

describe("extractCiteKeysFromTypst", () => {
  it("collects @key cites and ignores package namespaces", () => {
    const source = `
#import "@preview/cetz:0.3.4": canvas
#import "@local/mine:0.1.0"

See @used2024 and also @other.
Contact foo@example.com is not a cite.
`;
    expect(extractCiteKeysFromTypst(source)).toEqual(["other", "used2024"]);
    expect(extractCiteKeysFromTypst("See @a and @b.")).toEqual(["a", "b"]);
  });

  it("collects #cite(<a>, <b>) and label(\"…\")", () => {
    const source = `#cite(<alpha>, <beta>)
#cite(label("gamma"))
`;
    expect(extractCiteKeysFromTypst(source)).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("extractTypstBibliographyRel", () => {
  it("reads the first .bib path from #bibliography", () => {
    expect(extractTypstBibliographyRel(`#bibliography("refs.bib")`)).toBe("refs.bib");
    expect(extractTypstBibliographyRel(`#bibliography(("a.yml", "b.yml"))`)).toBeNull();
    expect(extractTypstBibliographyRel(`#import "@preview/foo:1.0.0"`)).toBeNull();
  });
});

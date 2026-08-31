import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compileTypstLiveSvg,
  countTypstWatchFinished,
  disposeTypstLiveWatchers,
  liveErrorExcerpt,
  parseTypstWatchStatus,
  selectLiveSvgPageNames,
  typstLiveOutDir,
} from "../../src/main/compile/typst-live";
import { resolveBundledTypstBinaryPath } from "../../src/main/compile/typst-binary";
import { typstLegacyProjectLiveDirRel } from "../../src/shared/compile/typst-format";

describe("parseTypstWatchStatus", () => {
  it("reads the 0.15 watch success line from stderr", () => {
    const stderr = `watching /tmp/main.typ
writing to /tmp/out/page-{p}.svg

[01:46:33] compiled successfully in 21.98 ms
`;
    expect(parseTypstWatchStatus(stderr)).toBe("ok");
    expect(countTypstWatchFinished(stderr)).toBe(1);
  });

  it("treats warnings as a usable preview", () => {
    expect(parseTypstWatchStatus("[12:00:00] compiled with warnings in 8.1 ms")).toBe("ok");
  });

  it("treats compiled with errors as a failed pass", () => {
    expect(parseTypstWatchStatus("[12:00:00] compiled with errors")).toBe("err");
  });

  it("counts each finished pass in an accumulating pipe", () => {
    const first = "[01:46:33] compiled successfully in 21.98 ms\n";
    const second = `${first}[01:46:34] compiled successfully in 4.02 ms\n`;
    expect(countTypstWatchFinished(first)).toBe(1);
    expect(countTypstWatchFinished(second)).toBe(2);
  });
});

describe("liveErrorExcerpt", () => {
  it("drops watching/compiling chatter so the problems strip is not a watch dump", () => {
    const raw = `watching /tmp/main.typ
writing to /tmp/out/x-{p}.svg
[01:57:31] compiling ...
[01:57:31] compiled successfully in 10.95 ms
error: expected semicolon
   ┌─ main.typ:3:1
`;
    expect(liveErrorExcerpt(raw)).toContain("error: expected semicolon");
    expect(liveErrorExcerpt(raw)).not.toContain("watching");
    expect(liveErrorExcerpt("watching only")).toBe("");
  });
});

describe("selectLiveSvgPageNames", () => {
  it("keeps every page of the newest {t} set, not only the latest mtime file", () => {
    const names = [
      "draft-1-of-5.svg",
      "draft-2-of-5.svg",
      "draft-1-of-2.svg",
      "draft-2-of-2.svg",
    ];
    const mtimes = new Map([
      ["draft-1-of-5.svg", 1],
      ["draft-2-of-5.svg", 1],
      ["draft-1-of-2.svg", 9],
      ["draft-2-of-2.svg", 9],
    ]);
    expect(selectLiveSvgPageNames(names, mtimes)).toEqual([
      "draft-1-of-2.svg",
      "draft-2-of-2.svg",
    ]);
  });
});

describe("compileTypstLiveSvg watch session", () => {
  afterEach(() => {
    disposeTypstLiveWatchers();
  });

  const bundled = resolveBundledTypstBinaryPath();

  it("writes live SVG under the app home, not the paper .workbench", () => {
    const root = "/Users/me/paper";
    const dir = typstLiveOutDir(root, "draft");
    expect(dir.includes("/.prismnext/typst-live/")).toBe(true);
    expect(dir.startsWith(root)).toBe(false);
    expect(dir).not.toContain(".workbench/compile/typst/live");
  });

  it.skipIf(!existsSync(bundled))("reuses typst watch and keeps all pages", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-typst-live-"));
    const src = `#set page(height: 4cm)\n= One\n#pagebreak()\n= Two\n`;
    writeFileSync(join(root, "main.typ"), src, "utf8");
    const first = await compileTypstLiveSvg(root, "main.typ", {
      dirtyFiles: [{ relPath: "main.typ", content: src }],
    });
    expect(first.success, first.error).toBe(true);
    expect(first.files?.length).toBe(2);
    expect(existsSync(join(root, typstLegacyProjectLiveDirRel("main")))).toBe(false);

    const secondSrc = `${src}= still two pages\n`;
    const second = await compileTypstLiveSvg(root, "main.typ", {
      dirtyFiles: [{ relPath: "main.typ", content: secondSrc }],
    });
    expect(second.success, second.error).toBe(true);
    expect(second.files?.length).toBe(2);
  }, 20_000);
});

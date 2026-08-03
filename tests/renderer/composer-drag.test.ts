import { describe, expect, it } from "vitest";
import {
  COMPOSER_INSERT_MIME,
  acceptComposerDrop,
  parseComposerDragPayloads,
  serializeComposerDragPayloads,
  dragPayloadToContextRequest,
  setComposerDragData,
} from "../../src/renderer/lib/chat/composer-drag";
import { composerDragGhostMeta } from "../../src/renderer/lib/chat/composer-drag-preview";
import { contextInsertToPart } from "../../src/renderer/lib/chat/context-insert";

describe("composer-drag", () => {
  it("round-trips multiple payloads", () => {
    const raw = serializeComposerDragPayloads([
      { v: 1, kind: "file-mention", filePath: "main.tex", fileId: "f1", label: "main.tex" },
      { v: 1, kind: "link", url: "https://example.com", label: "example" },
    ]);
    expect(parseComposerDragPayloads(raw)).toHaveLength(2);
  });

  it("rejects garbage", () => {
    expect(parseComposerDragPayloads("not-json")).toEqual([]);
    expect(parseComposerDragPayloads(JSON.stringify({ v: 1, kind: "nope" }))).toEqual([]);
  });

  it("exports mime constant", () => {
    expect(COMPOSER_INSERT_MIME).toContain("prismnext.composer-insert");
  });

  it("acceptComposerDrop consumes internal drags once", () => {
    const dt = {
      types: [COMPOSER_INSERT_MIME],
      getData: (type: string) =>
        type === COMPOSER_INSERT_MIME
          ? serializeComposerDragPayloads([
              { v: 1, kind: "link", url: "https://example.com" },
            ])
          : "",
    } as DataTransfer;
    let prevented = false;
    let stopped = false;
    const payloads = acceptComposerDrop({
      dataTransfer: dt,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    });
    expect(payloads).toHaveLength(1);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
  });

  it("setComposerDragData sets mime + plain fallback", () => {
    const store = new Map<string, string>();
    const dt = {
      types: [] as string[],
      setData: (type: string, value: string) => {
        store.set(type, value);
        dt.types.push(type);
      },
      effectAllowed: "",
      setDragImage: () => {},
    } as DataTransfer;
    setComposerDragData(dt, [
      { v: 1, kind: "file-mention", filePath: "a/b.tex", fileId: "1", label: "b.tex" },
    ]);
    expect(store.get(COMPOSER_INSERT_MIME)).toBeTruthy();
    expect(store.get("text/plain")).toBe("a/b.tex");
  });
});

describe("composer-drag-preview", () => {
  it("labels paper snippets with page + excerpt", () => {
    const meta = composerDragGhostMeta({
      v: 1,
      kind: "paper-snippet",
      bibkey: "smith2024",
      title: "Paper",
      page: 3,
      quotedText: "World models learn latent dynamics.",
    });
    expect(meta.primary).toBe("smith2024:p3");
    expect(meta.secondary).toContain("World models");
    expect(meta.variant).toBe("literature");
  });
});

describe("contextInsertToPart mention kinds", () => {
  it("maps file-mention to @file part", () => {
    const part = contextInsertToPart({
      kind: "file-mention",
      filePath: "sections/intro.tex",
      fileId: "abc",
      label: "intro.tex",
    });
    expect(part.type).toBe("mention");
    if (part.type === "mention") {
      expect(part.mentionType).toBe("file");
      expect(part.filePath).toBe("sections/intro.tex");
    }
  });

  it("maps link kind", () => {
    const part = contextInsertToPart({
      kind: "link",
      url: "https://arxiv.org/abs/1",
      label: "arxiv",
    });
    expect(part.type).toBe("link");
  });

  it("maps drag payload via bridge", () => {
    const req = dragPayloadToContextRequest({
      v: 1,
      kind: "paper-mention",
      paperId: "p1",
      bibkey: "smith2024",
      title: "A Paper",
    });
    const part = contextInsertToPart(req);
    expect(part.type).toBe("mention");
    if (part.type === "mention") {
      expect(part.mentionType).toBe("paper");
      expect(part.bibkey).toBe("smith2024");
    }
  });
});

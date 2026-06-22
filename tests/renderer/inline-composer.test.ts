import { describe, expect, it } from "vitest";
import { detectQueryAtCursor } from "../../src/renderer/components/modules/chat/inline-composer/query";
import { createTokenId, partsToPlainText, isComposerEmpty } from "../../src/renderer/components/modules/chat/inline-composer/tokens";
import {
  partsToDoc,
  docToParts,
  parseDraftJson,
  draftToJson,
  mergeAdjacentText,
} from "../../src/renderer/components/modules/chat/inline-composer/serialize";
import { loadDraftParts } from "../../src/renderer/components/modules/chat/inline-composer/draft-utils";

import { preferredMenuSide } from "../../src/renderer/components/modules/chat/inline-composer/dropdown-position";

describe("inline composer query", () => {
  it("detects @mention and /command at cursor", () => {
    expect(detectQueryAtCursor("hello @wri", 10)).toEqual({
      kind: "mention",
      query: "wri",
      from: 6,
      to: 10,
    });
    expect(detectQueryAtCursor("/setup", 6)).toEqual({
      kind: "slash",
      query: "setup",
      from: 0,
      to: 6,
    });
    expect(detectQueryAtCursor("hello /compile-doc", 18)).toEqual({
      kind: "slash",
      query: "compile-doc",
      from: 6,
      to: 18,
    });
  });

  it("prefers opening upward near viewport bottom", () => {
    const anchor = { top: 700, left: 100, bottom: 720, right: 110 };
    expect(preferredMenuSide(anchor)).toBe("top");
    const topAnchor = { top: 80, left: 100, bottom: 100, right: 110 };
    expect(preferredMenuSide(topAnchor)).toBe("bottom");
  });
});

describe("inline composer serialize", () => {
  it("round-trips text and tokens", () => {
    const fileId = createTokenId();
    const profileId = createTokenId();
    const parts = mergeAdjacentText([
      { type: "text", text: "hello " },
      {
        type: "mention",
        mentionType: "file",
        id: fileId,
        label: "main.tex",
        filePath: "main.tex",
        fileId: "f1",
      },
      { type: "text", text: " then " },
      {
        type: "mention",
        mentionType: "profile",
        id: profileId,
        label: "Reviewer",
        profileId: "p1",
      },
    ]);

    const { doc, tokenMap } = partsToDoc(parts);
    const restored = docToParts(doc, tokenMap);
    expect(restored).toEqual(parts);
    expect(partsToPlainText(parts)).toBe("hello @main.tex then @Reviewer");
  });

  it("parses draft json and legacy chips", () => {
    const parts = [{ type: "text" as const, text: "hi" }];
    const json = draftToJson(parts);
    expect(parseDraftJson(json)).toEqual(parts);

    const legacy = loadDraftParts({
      input: "legacy text",
      chips: [{ id: "c1", commandName: "setup", action: "setup", source: "builtin" }],
      profileChip: { id: "p1", profileId: "prof-1", profileName: "Writer" },
    });
    expect(legacy.some((p) => p.type === "command")).toBe(true);
    expect(legacy.some((p) => p.type === "mention" && p.mentionType === "profile")).toBe(true);
    expect(legacy.some((p) => p.type === "text" && p.text === "legacy text")).toBe(true);
  });

  it("detects empty composer", () => {
    expect(isComposerEmpty([{ type: "text", text: "" }])).toBe(true);
    expect(isComposerEmpty([{ type: "text", text: "  " }])).toBe(true);
    expect(
      isComposerEmpty([
        {
          type: "command",
          id: "x",
          label: "setup",
          commandName: "setup",
          source: "builtin",
        },
      ]),
    ).toBe(false);
  });
});

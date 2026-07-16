import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { EditorSelection, EditorState } from "@codemirror/state";
import { detectQueryAtCursor } from "../../src/renderer/components/modules/chat/inline-composer/query";
import { buildSlashOptions } from "../../src/renderer/components/modules/chat/inline-composer/composer-dropdown";
import { buildMentionOptions } from "../../src/renderer/components/modules/chat/inline-composer/inline-composer-editor";
import { ComposerTokenChip } from "../../src/renderer/components/modules/chat/inline-tokens/inline-token-parts";
import { createTokenId, partsToPlainText, partsToAgentText, isComposerEmpty, mergeAdjacentText, parseTextToComposerParts, parseTextWithLinks, hasLinkParts } from "../../src/renderer/lib/chat/composer-parts";
import {
  partsToDoc,
  docToParts,
  parseDraftJson,
  draftToJson,
  TOKEN_OBJECT,
  collapseRedundantTokenSeparators,
  docPosToPlainTextOffset,
} from "../../src/renderer/components/modules/chat/inline-composer/serialize";
import {
  atomicTokenBackspace,
  composerTokenTransactionFilter,
  insertComposerParts,
  insertComposerToken,
  linkifyViewIfNeeded,
  readPartsFromView,
  selectionAfterDocReplace,
  setTokenMapEffect,
  tokenMapStateField,
} from "../../src/renderer/components/modules/chat/inline-composer/token-field";
import { loadDraftParts } from "../../src/renderer/components/modules/chat/inline-composer/draft-utils";

import { preferredMenuSide } from "../../src/renderer/components/modules/chat/inline-composer/dropdown-position";
import { compactContentNeedsExpand } from "../../src/renderer/components/modules/chat/inline-composer/compact-overflow";
import { composerNeedsExpandedLayout } from "../../src/renderer/hooks/use-chat-composer";
import type { ComposerPart } from "../../src/renderer/lib/chat/composer-parts";

function createTokenTestView(doc: string, tokenMap = new Map<number, ComposerPart>()) {
  const view = {
    state: EditorState.create({
      doc,
      extensions: [tokenMapStateField, composerTokenTransactionFilter],
    }),
    dispatch(spec: Parameters<import("@codemirror/view").EditorView["dispatch"]>[0]) {
      this.state = this.state.update(spec).state;
    },
  };
  view.state = view.state.update({ effects: setTokenMapEffect.of(tokenMap) }).state;
  return view as unknown as import("@codemirror/view").EditorView;
}

describe("compact overflow", () => {
  it("expands on second line", () => {
    expect(
      compactContentNeedsExpand({
        lineCount: 2,
        textWidth: 10,
        availableWidth: 200,
        charWidth: 7,
      }),
    ).toBe(true);
  });

  it("expands when single line fills available width", () => {
    expect(
      compactContentNeedsExpand({
        lineCount: 1,
        textWidth: 196,
        availableWidth: 200,
        charWidth: 7,
      }),
    ).toBe(true);
  });

  it("stays compact when line still has room", () => {
    expect(
      compactContentNeedsExpand({
        lineCount: 1,
        textWidth: 120,
        availableWidth: 200,
        charWidth: 7,
      }),
    ).toBe(false);
  });
});

describe("composerNeedsExpandedLayout", () => {
  it("ignores @ and / tokens on a single line", () => {
    const parts: ComposerPart[] = [
      { type: "mention", mentionType: "expert", id: "1", label: "Agent", expertId: "a" },
      { type: "text", text: " hello" },
    ];
    expect(composerNeedsExpandedLayout(parts)).toBe(false);
  });

  it("expands for explicit newline text", () => {
    const parts: ComposerPart[] = [{ type: "text", text: "line one\nline two" }];
    expect(composerNeedsExpandedLayout(parts)).toBe(true);
  });

  it("newline-only draft is empty for send but still needs expanded layout", () => {
    const parts: ComposerPart[] = [{ type: "text", text: "\n" }];
    expect(isComposerEmpty(parts)).toBe(true);
    expect(composerNeedsExpandedLayout(parts)).toBe(true);
  });
});

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

  it("builds slash options grouped by kind", () => {
    const options = buildSlashOptions(
      "git",
      [{ name: "git-status", description: "Show status", source: "builtin", enabled: true }],
      [{ id: "git-skill", name: "Git Helper", enabled: true }],
      [{ name: "github" }],
    );
    expect(options.map((o) => o.kind)).toEqual(["command", "skill", "mcp"]);
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
        mentionType: "expert",
        id: profileId,
        label: "Reviewer",
        expertId: "p1",
      },
    ]);

    const { doc, tokenMap } = partsToDoc(parts);
    const restored = docToParts(doc, tokenMap);
    expect(collapseRedundantTokenSeparators(restored)).toEqual(
      collapseRedundantTokenSeparators(parts),
    );
    expect(partsToPlainText(restored)).toBe("hello @main.tex then @Reviewer");
  });

  it("stores one object char plus separator per token", () => {
    const linkId = createTokenId();
    const parts: ComposerPart[] = [
      { type: "link", id: linkId, label: "ex.com", url: "https://ex.com" },
      { type: "text", text: "hello" },
    ];
    const { doc, tokenMap } = partsToDoc(parts);
    expect(doc).toBe(`${TOKEN_OBJECT} hello`);
    expect(tokenMap.get(0)?.id).toBe(linkId);
    expect(docToParts(doc, tokenMap)).toEqual(parts);
  });

  it("inserts before a token at doc position 0", () => {
    const linkId = createTokenId();
    const link: ComposerPart = { type: "link", id: linkId, label: "ex.com", url: "https://ex.com" };
    const { doc, tokenMap } = partsToDoc([link, { type: "text", text: "hello" }]);
    const view = createTokenTestView(doc, tokenMap);

    view.dispatch({
      changes: { from: 0, to: 0, insert: "前缀" },
      selection: EditorSelection.cursor(2),
    });

    expect(view.state.doc.toString()).toBe(`前缀${TOKEN_OBJECT} hello`);
  });

  it("inserts after a token at the next doc position", () => {
    const linkId = createTokenId();
    const link: ComposerPart = { type: "link", id: linkId, label: "ex.com", url: "https://ex.com" };
    const { doc, tokenMap } = partsToDoc([link, { type: "text", text: "hello" }]);
    const view = createTokenTestView(doc, tokenMap);

    view.dispatch({
      changes: { from: 1, to: 1, insert: "右" },
      selection: EditorSelection.cursor(2),
    });

    expect(view.state.doc.toString()).toBe(`${TOKEN_OBJECT}右 hello`);
  });

  it("places cursor after token when inserting from @ or / dropdown", () => {
    const profileId = createTokenId();
    const mention: ComposerPart = {
      type: "mention",
      mentionType: "expert",
      id: profileId,
      label: "Agent",
      expertId: "p1",
    };
    const view = createTokenTestView("", new Map());

    insertComposerParts(view, [mention], 0, 0);

    expect(view.state.doc.toString()).toBe(`${TOKEN_OBJECT} `);
    expect(view.state.selection.main.head).toBe(2);
  });

  it("does not double the separator after linkify trailing space", () => {
    const parts = parseTextToComposerParts("https://example.com ");
    const collapsed = collapseRedundantTokenSeparators(parts);
    const { doc } = partsToDoc(collapsed);
    expect(doc).toBe(`${TOKEN_OBJECT} `);
    expect(doc.match(/ $/g)?.length).toBe(1);
  });

  it("keeps cursor after the link token when linkifying a URL plus space", () => {
    const view = createTokenTestView("https://example.com ", new Map());
    view.dispatch({ selection: EditorSelection.cursor("https://example.com ".length) });

    expect(linkifyViewIfNeeded(view)).toBe(true);

    expect(view.state.doc.toString()).toBe(`${TOKEN_OBJECT} `);
    expect(view.state.selection.main.head).toBe(2);
  });

  it("keeps cursor after token when normalizing redundant trailing spaces", () => {
    const oldDoc = `${TOKEN_OBJECT}  `;
    const newDoc = `${TOKEN_OBJECT} `;
    const selection = selectionAfterDocReplace(oldDoc, newDoc, oldDoc.length);
    expect(selection.main.head).toBe(2);
  });

  it("deletes space with default backspace then deletes token atomically", () => {
    const linkId = createTokenId();
    const link: ComposerPart = { type: "link", id: linkId, label: "ex.com", url: "https://ex.com" };
    const { doc, tokenMap } = partsToDoc([link, { type: "text", text: "hello" }]);
    const view = createTokenTestView(doc, tokenMap);

    view.dispatch({ selection: EditorSelection.cursor(2) });
    view.dispatch({ changes: { from: 1, to: 2, insert: "" }, selection: EditorSelection.cursor(1) });
    expect(view.state.doc.toString()).toBe(`${TOKEN_OBJECT}hello`);

    expect(atomicTokenBackspace(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("hello");
  });

  it("deletes lone token with backspace at doc end", () => {
    const linkId = createTokenId();
    const link: ComposerPart = { type: "link", id: linkId, label: "ex.com", url: "https://ex.com" };
    const { doc, tokenMap } = partsToDoc([link]);
    const view = createTokenTestView(doc, tokenMap);

    view.dispatch({ selection: EditorSelection.cursor(1) });
    view.dispatch({ changes: { from: 1, to: 2, insert: "" }, selection: EditorSelection.cursor(1) });
    expect(atomicTokenBackspace(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("");
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
    expect(legacy.some((p) => p.type === "mention" && p.mentionType === "expert")).toBe(true);
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

  it("maps doc positions without counting auto token separators as plain text", () => {
    const mention: ComposerPart = {
      type: "mention",
      mentionType: "file",
      id: createTokenId(),
      label: "a.tex",
      filePath: "a.tex",
      fileId: "f1",
    };
    const { doc } = partsToDoc([mention, { type: "text", text: "@foo" }]);
    // Doc: [token][sep]@foo — @ is at doc index 2, plain index 0
    expect(docPosToPlainTextOffset(doc, 2)).toBe(0);
    expect(docPosToPlainTextOffset(doc, 6)).toBe(4);
  });

  it("inserts a second mention after the first without dropping either", () => {
    const first: ComposerPart = {
      type: "mention",
      mentionType: "file",
      id: createTokenId(),
      label: "a.tex",
      filePath: "a.tex",
      fileId: "f1",
    };
    const second: ComposerPart = {
      type: "mention",
      mentionType: "file",
      id: createTokenId(),
      label: "b.tex",
      filePath: "b.tex",
      fileId: "f2",
    };
    const { doc, tokenMap } = partsToDoc([first, { type: "text", text: "@foo" }]);
    const view = createTokenTestView(doc, tokenMap);
    const queryFrom = doc.indexOf("@");
    const queryTo = queryFrom + "@foo".length;

    insertComposerToken(view, second, queryFrom, queryTo);

    const restored = readPartsFromView(view);
    expect(view.state.doc.toString().split(TOKEN_OBJECT).length - 1).toBe(2);
    expect(restored.filter((p) => p.type === "mention")).toHaveLength(2);
    expect(restored.some((p) => p.type === "mention" && p.label === "a.tex")).toBe(true);
    expect(restored.some((p) => p.type === "mention" && p.label === "b.tex")).toBe(true);
  });

  it("inserts a second slash command after the first", () => {
    const first: ComposerPart = {
      type: "command",
      id: createTokenId(),
      label: "setup",
      commandName: "setup",
      source: "builtin",
    };
    const second: ComposerPart = {
      type: "command",
      id: createTokenId(),
      label: "git-status",
      commandName: "git-status",
      source: "builtin",
    };
    const { doc, tokenMap } = partsToDoc([first, { type: "text", text: " /git" }]);
    const view = createTokenTestView(doc, tokenMap);
    const queryFrom = doc.indexOf("/");
    const queryTo = queryFrom + "/git".length;

    insertComposerToken(view, second, queryFrom, queryTo);

    const restored = readPartsFromView(view);
    expect(restored.filter((p) => p.type === "command")).toHaveLength(2);
  });
});

describe("parseTextWithLinks", () => {
  it("extracts https URLs from plain text", () => {
    const parts = parseTextWithLinks("see https://example.com/docs for info");
    expect(hasLinkParts(parts)).toBe(true);
    expect(parts.find((p) => p.type === "link")).toMatchObject({
      type: "link",
      url: "https://example.com/docs",
      label: "example.com",
    });
  });

  it("handles trailing punctuation", () => {
    const parts = parseTextWithLinks("Visit https://arxiv.org/abs/1234.");
    const link = parts.find((p) => p.type === "link");
    expect(link && link.type === "link" ? link.url : "").toBe("https://arxiv.org/abs/1234");
    expect(parts.some((p) => p.type === "text" && p.text === ".")).toBe(true);
  });

  it("does not treat Python attribute access as URLs", () => {
    const code = "import time\nfor i in range(3):\n    time.sleep(0.35)\n    time.sleep(0.5)";
    const parts = parseTextWithLinks(code);
    expect(hasLinkParts(parts)).toBe(false);
  });

  it("still linkifies bare domains with common TLDs", () => {
    const parts = parseTextWithLinks("see example.com for docs");
    expect(parts.find((p) => p.type === "link")).toMatchObject({
      type: "link",
      url: "https://example.com",
      label: "example.com",
    });
  });
});

describe("parseTextToComposerParts", () => {
  it("converts pasted URLs into link tokens", () => {
    const parts = parseTextToComposerParts("see https://example.com/path for more");
    expect(parts.some((p) => p.type === "link" && p.url === "https://example.com/path")).toBe(true);
    expect(parts.some((p) => p.type === "text" && p.text.includes("see"))).toBe(true);
  });

  it("uses full URL in agent text but short label in display text", () => {
    const parts = parseTextToComposerParts("https://example.com");
    const link = parts.find((p) => p.type === "link");
    expect(link).toBeDefined();
    if (link?.type !== "link") return;
    expect(partsToPlainText([link])).toBe(link.label);
    expect(partsToAgentText([link])).toBe(link.url);
  });
});

describe("partsToAgentText for experiment-run", () => {
  it("flattens run + artifact into multi-line context for the agent", () => {
    const text = partsToAgentText([
      {
        type: "experiment-run",
        id: "tok-x",
        label: "run:run-20260707-120000-a1b2",
        runId: "run-20260707-120000-a1b2",
        experimentId: "exp-test",
        command: "python train.py",
        exitCode: 0,
        startedAt: "2026-07-07T12:00:00.000Z",
        finishedAt: "2026-07-07T12:00:05.000Z",
        artifactPath: "experiment/exp-test/plot.png",
        linkMethod: "explicit",
        artifacts: ["experiment/exp-test/plot.png"],
        env: { python: "/usr/bin/python3", pythonVersion: "3.12", platform: "darwin", gitCommit: "abc" },
        chatSessionId: "ses_x",
        workspacePath: "experiment/exp-test",
      },
    ]);
    // The agent prompt must include command, exit, artifact - not just the chip label.
    expect(text).toContain("experiment-run: run:run-20260707-120000-a1b2");
    expect(text).toContain("`python train.py`");
    expect(text).toContain("exit: 0");
    expect(text).toContain("experiment/exp-test/plot.png");
    expect(text).toContain("(explicit)");
  });

  it("expands cite-in-paper intent with Methods / figure scaffolding", () => {
    const text = partsToAgentText([
      {
        type: "experiment-run",
        id: "tok-cite",
        label: "cite:run-20260707-120000",
        runId: "run-20260707-120000-a1b2",
        command: "python plot.py",
        exitCode: 0,
        startedAt: "2026-07-07T12:00:00.000Z",
        finishedAt: "2026-07-07T12:00:05.000Z",
        artifacts: ["results/fig.png"],
        workspacePath: "experiment/exp-plot",
        intent: "cite-in-paper",
      },
    ]);
    expect(text).toContain("Paper reverse-link");
    expect(text).toContain("![fig.png](experiment/exp-plot/results/fig.png)");
  });
});

describe("buildMentionOptions for experiment", () => {
  it("filters and returns experiment options for matching query", () => {
    const experiments = [
      { id: "exp-lr", title: "LR Ablation", workspacePath: "experiment/exp-lr", runCount: 3, lastRunAt: "2026-07-07T12:00:00.000Z" },
      { id: "exp-batch", title: "Batch Size Study", workspacePath: "experiment/exp-batch", runCount: 0, lastRunAt: null },
      { id: "exp-other", title: "Unrelated", workspacePath: "experiment/exp-other", runCount: 1, lastRunAt: "2026-07-01T00:00:00.000Z" },
    ];
    const options = buildMentionOptions("lr", [], [], [], experiments);
    expect(options).toHaveLength(1);
    expect(options[0]?.kind).toBe("experiment");
    if (options[0]?.kind === "experiment") {
      expect(options[0].experiment.id).toBe("exp-lr");
      expect(options[0].experiment.title).toBe("LR Ablation");
    }
  });

  it("matches against workspacePath and id in addition to title", () => {
    const experiments = [
      { id: "exp-a", title: "Alpha", workspacePath: "experiment/exp-a", runCount: 0, lastRunAt: null },
      { id: "exp-batch", title: "Beta", workspacePath: "experiment/exp-batch", runCount: 0, lastRunAt: null },
    ];
    const byWorkspace = buildMentionOptions("batch", [], [], [], experiments);
    expect(byWorkspace).toHaveLength(1);
    expect(byWorkspace[0]?.kind).toBe("experiment");
    if (byWorkspace[0]?.kind === "experiment") {
      expect(byWorkspace[0].experiment.id).toBe("exp-batch");
    }
    // empty query returns the full list (subject to slice cap)
    const all = buildMentionOptions("", [], [], [], experiments);
    expect(all).toHaveLength(2);
  });
});

describe("partsToAgentText for mention experiment", () => {
  it("renders @-prefixed label for experiment mention chips", () => {
    const text = partsToAgentText([
      {
        type: "mention",
        mentionType: "experiment",
        id: "tok-e",
        label: "LR Ablation",
        experimentId: "exp-lr",
      },
      { type: "text", text: " 看看这个实验的最近几条 run" },
    ]);
    expect(text).toContain("@LR Ablation");
    expect(text).toContain("看看这个实验的最近几条 run");
  });
});

describe("ComposerTokenChip for experiment mention", () => {
  it("renders a chip with the experiment label and icon (does not return null)", () => {
    const { container } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(ComposerTokenChip as any, {
        part: {
          type: "mention",
          mentionType: "experiment",
          id: "tok-exp",
          label: "LR Ablation",
          experimentId: "exp-lr",
        },
      }),
    );
    // The chip's root <span> must carry the inline-token marker (no `return null`).
    const chip = container.querySelector("[data-inline-token]");
    expect(chip).toBeTruthy();
    // And it must surface the experiment id in its title for hover-tooltip.
    expect(chip?.getAttribute("title")).toContain("exp-lr");
    // The label appears as text content (possibly truncated by max-w, hence a substring match).
    expect(chip?.textContent).toContain("LR Ablation");
  });
});

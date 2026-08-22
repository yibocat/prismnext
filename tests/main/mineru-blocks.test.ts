import { describe, it, expect } from "vitest";
import {
  buildBlocksFromContentList,
  buildBlocksFromMiddleJson,
  buildMineruExtractBlocks,
  enrichBlocksWithMiddleJson,
  findContentListEntryName,
  findMiddleJsonEntryName,
  reapplyGeometryFromMiddle,
} from "../../src/main/services/mineru-blocks";
import {
  hitTestBlock,
  blocksOverlappingRect,
  normalizeBbox,
  splitBboxAcrossPages,
  type PaperExtractBlock,
} from "../../src/shared/literature/paper-extract-block";

describe("normalizeBbox", () => {
  it("normalizes 0-1000 integer coords to 0-1", () => {
    expect(normalizeBbox([100, 200, 500, 800])).toEqual([0.1, 0.2, 0.5, 0.8]);
  });

  it("keeps 0-1 float coords", () => {
    expect(normalizeBbox([0.1, 0.2, 0.5, 0.8])).toEqual([0.1, 0.2, 0.5, 0.8]);
  });
});

describe("buildBlocksFromContentList", () => {
  const images = [
    {
      relPath: "images/fig.png",
      data: Buffer.from("x"),
      zipEntries: ["images/fig.png"],
    },
  ];

  it("parses v1 flat content_list entries", () => {
    const json = [
      {
        type: "text",
        text: "Introduction paragraph.",
        page_idx: 0,
        bbox: [62, 100, 900, 200],
      },
      {
        type: "equation",
        text: "$$E = mc^2$$",
        page_idx: 0,
        bbox: [100, 300, 800, 400],
      },
      {
        type: "header",
        text: "Header noise",
        page_idx: 0,
        bbox: [0, 0, 1000, 50],
      },
      {
        type: "table",
        table_caption: ["Table 1 Results"],
        table_body: "<table><tr><td>A</td></tr></table>",
        page_idx: 1,
        bbox: [62, 480, 946, 904],
      },
    ];
    const blocks = buildBlocksFromContentList(json, images);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks[1]!.type).toBe("equation");
    expect(blocks[2]!.type).toBe("table");
  });
});

describe("buildBlocksFromMiddleJson", () => {
  const middle = {
    pdf_info: [
      {
        page_idx: 0,
        page_size: [612, 792],
        preproc_blocks: [
          {
            type: "text",
            bbox: [62, 100, 400, 200],
            lines: [
              {
                bbox: [62, 100, 400, 130],
                spans: [{ type: "text", content: "Hello " }],
              },
              {
                bbox: [62, 140, 400, 170],
                spans: [{ type: "text", content: "world" }],
              },
            ],
          },
          {
            type: "interline_equation",
            bbox: [100, 220, 500, 260],
            lines: [
              {
                bbox: [100, 220, 500, 260],
                spans: [{ type: "text", content: "$$E=mc^2$$" }],
              },
            ],
          },
          {
            type: "image",
            bbox: [62, 300, 400, 500],
            blocks: [
              {
                type: "image_body",
                bbox: [62, 300, 400, 450],
                lines: [],
              },
            ],
          },
        ],
      },
    ],
  };

  const contentList = [
    { type: "text", text: "Hello world", page_idx: 0, bbox: [62, 100, 400, 200] },
    { type: "equation", text: "$$E=mc^2$$", page_idx: 0, bbox: [100, 220, 500, 260] },
    {
      type: "image",
      img_path: "images/fig.png",
      image_caption: ["Figure 1"],
      page_idx: 0,
      bbox: [62, 300, 400, 450],
    },
  ];

  it("creates one pickable block per preproc layout unit", () => {
    const blocks = buildBlocksFromMiddleJson(middle, contentList, [
      { relPath: "images/fig.png", data: Buffer.from("x"), zipEntries: ["images/fig.png"] },
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks[1]!.type).toBe("equation");
    expect(blocks[2]!.type).toBe("image");
  });

  it("uses block-level bbox, not per-line slices", () => {
    const blocks = buildBlocksFromMiddleJson(middle, contentList, []);
    expect(blocks[0]!.regions).toHaveLength(1);
    expect(blocks[0]!.regions![0]!.bbox[3]).toBeGreaterThan(0.2);
    expect(blocks[1]!.regions).toHaveLength(1);
    expect(blocks[1]!.regions![0]!.bbox[1]).toBeGreaterThan(0.25);
  });

  it("does not merge text and equation into one block", () => {
    const blocks = buildMineruExtractBlocks(contentList, [], { middle });
    expect(blocks.map((b) => b.type)).toEqual(["text", "equation", "image"]);
  });
});

describe("reapplyGeometryFromMiddle", () => {
  it("replaces geometry while keeping stored markdown", () => {
    const stored: PaperExtractBlock[] = [
      {
        id: "b0",
        index: 0,
        type: "text",
        pageIdx: 0,
        bbox: [0, 0, 1, 1],
        markdown: "Stored markdown",
        regions: [{ pageIdx: 0, bbox: [0, 0, 1, 1] }],
      },
    ];
    const middle = {
      pdf_info: [
        {
          page_idx: 0,
          page_size: [612, 792],
          preproc_blocks: [
            {
              type: "text",
              bbox: [62, 100, 400, 200],
              lines: [{ spans: [{ content: "x" }] }],
            },
          ],
        },
      ],
    };
    const fixed = reapplyGeometryFromMiddle(stored, middle);
    expect(fixed[0]!.markdown).toBe("Stored markdown");
    expect(fixed[0]!.regions).toHaveLength(1);
    expect(fixed[0]!.regions![0]!.bbox[2]).toBeLessThan(0.7);
  });

  it("matches markdown to leaves by bbox overlap, not array index", () => {
    const stored: PaperExtractBlock[] = [
      {
        id: "b0",
        index: 0,
        type: "text",
        pageIdx: 0,
        bbox: [0.7, 0.1, 0.9, 0.2],
        markdown: "Right column text",
        regions: [{ pageIdx: 0, bbox: [0.7, 0.1, 0.9, 0.2] }],
      },
      {
        id: "b1",
        index: 1,
        type: "text",
        pageIdx: 0,
        bbox: [0.1, 0.1, 0.4, 0.2],
        markdown: "Left column text",
        regions: [{ pageIdx: 0, bbox: [0.1, 0.1, 0.4, 0.2] }],
      },
    ];
    const middle = {
      pdf_info: [
        {
          page_idx: 0,
          page_size: [612, 792],
          preproc_blocks: [
            {
              type: "text",
              bbox: [62, 100, 250, 200],
              lines: [{ spans: [{ content: "left" }] }],
            },
            {
              type: "text",
              bbox: [430, 100, 560, 200],
              lines: [{ spans: [{ content: "right" }] }],
            },
          ],
        },
      ],
    };
    const fixed = reapplyGeometryFromMiddle(stored, middle);
    expect(fixed).toHaveLength(2);
    expect(fixed[0]!.markdown).toBe("Left column text");
    expect(fixed[1]!.markdown).toBe("Right column text");
  });
});

describe("enrichBlocksWithMiddleJson", () => {
  it("reapplies preproc block geometry on read", () => {
    const blocks = buildBlocksFromContentList(
      [{ type: "text", text: "Hello", page_idx: 0, bbox: [0, 0, 1000, 1000] }],
      [],
    );
    const middle = {
      pdf_info: [
        {
          page_idx: 0,
          page_size: [612, 792],
          preproc_blocks: [{ type: "text", bbox: [62, 100, 400, 200], lines: [] }],
        },
      ],
    };
    const enriched = enrichBlocksWithMiddleJson(blocks, middle);
    expect(enriched[0]!.regions).toHaveLength(1);
    expect(enriched[0]!.regions![0]!.bbox[2]).toBeLessThan(0.7);
  });
});

describe("findMiddleJsonEntryName", () => {
  it("finds middle.json in zip entries", () => {
    expect(findMiddleJsonEntryName(["full.md", "middle.json"])).toBe("middle.json");
  });
});

describe("hitTestBlock multi-region", () => {
  const blocks: PaperExtractBlock[] = [
    {
      id: "b0",
      index: 0,
      type: "text",
      pageIdx: 0,
      bbox: [0.1, 0.85, 0.9, 1.25],
      regions: splitBboxAcrossPages(0, [0.1, 0.85, 0.9, 1.25]),
      markdown: "cross page",
    },
  ];

  it("hits continuation on the next page", () => {
    const hit = hitTestBlock(blocks, 1, 0.5, 0.1);
    expect(hit?.id).toBe("b0");
  });
});

describe("hitTestBlock", () => {
  const blocks: PaperExtractBlock[] = [
    {
      id: "b0",
      index: 0,
      type: "text",
      pageIdx: 0,
      bbox: [0.1, 0.1, 0.9, 0.3],
      regions: [{ pageIdx: 0, bbox: [0.1, 0.1, 0.9, 0.3] }],
      markdown: "big",
    },
    {
      id: "b1",
      index: 1,
      type: "equation",
      pageIdx: 0,
      bbox: [0.2, 0.15, 0.4, 0.25],
      regions: [{ pageIdx: 0, bbox: [0.2, 0.15, 0.4, 0.25] }],
      markdown: "eq",
    },
  ];

  it("returns smallest containing block", () => {
    const hit = hitTestBlock(blocks, 0, 0.25, 0.2);
    expect(hit?.id).toBe("b1");
  });
});

describe("blocksOverlappingRect", () => {
  const blocks: PaperExtractBlock[] = [
    {
      id: "b0",
      index: 0,
      type: "text",
      pageIdx: 0,
      bbox: [0.1, 0.1, 0.5, 0.3],
      regions: [{ pageIdx: 0, bbox: [0.1, 0.1, 0.5, 0.3] }],
      markdown: "a",
    },
    {
      id: "b1",
      index: 1,
      type: "text",
      pageIdx: 0,
      bbox: [0.5, 0.1, 0.9, 0.3],
      regions: [{ pageIdx: 0, bbox: [0.5, 0.1, 0.9, 0.3] }],
      markdown: "b",
    },
  ];

  it("finds overlapping blocks in reading order", () => {
    const hits = blocksOverlappingRect(blocks, 0, {
      left: 0.15,
      top: 0.15,
      width: 0.2,
      height: 0.1,
    });
    expect(hits.map((b) => b.id)).toEqual(["b0"]);
  });
});

describe("findContentListEntryName", () => {
  it("prefers v1 over v2", () => {
    expect(
      findContentListEntryName(["full.md", "paper_content_list.json", "paper_content_list_v2.json"]),
    ).toBe("paper_content_list.json");
  });
});

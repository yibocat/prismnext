import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import {
  parseMineruZipBuffer,
  rewriteMarkdownAssetPaths,
  mineruImageRelPath,
} from "../../src/main/literature/extract/mineru-zip";

function createTestZip(files: Record<string, string | Buffer>): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-mineru-zip-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const abs = path.join(dir, name);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    const zipPath = path.join(dir, "test.zip");
    execFileSync("zip", ["-r", zipPath, "."], { cwd: dir });
    return fs.readFileSync(zipPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("mineru-zip", () => {
  it("rewrites markdown image paths to local images/ folder", () => {
    const images = [
      {
        relPath: "images/fig-0.png",
        data: Buffer.from("png"),
        zipEntries: ["output/images/fig-0.png"],
      },
    ];
    const md = "# Paper\n\n![Figure 1](output/images/fig-0.png)\n";
    const out = rewriteMarkdownAssetPaths(md, images);
    expect(out).toContain("![Figure 1](images/fig-0.png)");
  });

  it("extracts full.md and images from a MinerU-style zip", async () => {
    const zip = createTestZip({
      "full.md": "# Title\n\n![fig](images/a.png)\n",
      "images/a.png": Buffer.from("fake-png-bytes"),
    });
    const parsed = await parseMineruZipBuffer(zip);
    expect(parsed.markdown).toContain("![fig](images/a.png)");
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].relPath).toBe("images/a.png");
    expect(parsed.images[0].data.toString()).toBe("fake-png-bytes");
    expect(parsed.blocks).toEqual([]);
  });

  it("parses content_list.json blocks from zip", async () => {
    const contentList = JSON.stringify([
      {
        type: "text",
        text: "Abstract text here.",
        page_idx: 0,
        bbox: [62, 480, 946, 904],
      },
      {
        type: "equation",
        text: "$$Q = f(P)$$",
        page_idx: 1,
        bbox: [100, 100, 900, 200],
      },
    ]);
    const zip = createTestZip({
      "full.md": "# Title\n",
      "content_list.json": contentList,
    });
    const parsed = await parseMineruZipBuffer(zip);
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]!.markdown).toContain("Abstract");
    expect(parsed.blocks[1]!.type).toBe("equation");
    expect(parsed.blocks[0]!.bbox[0]).toBeCloseTo(0.062, 3);
  });

  it("maps nested zip paths to images/basename", () => {
    expect(mineruImageRelPath("some/prefix/images/chart.jpeg")).toBe("images/chart.jpeg");
  });
});

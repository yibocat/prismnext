import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PaperExtractBlock } from "../../shared/paper-extract-block";
import {
  buildMineruExtractBlocks,
  findContentListEntryName,
  findMiddleJsonEntryName,
  findModelJsonEntryName,
} from "./mineru-blocks";

const execFileAsync = promisify(execFile);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

export interface MineruZipImageAsset {
  /** Relative to extract paper dir, e.g. `images/fig-0.png`. */
  relPath: string;
  data: Buffer;
  /** Original zip entry paths that map to this asset. */
  zipEntries: string[];
}

export interface MineruZipExtractResult {
  markdown: string;
  images: MineruZipImageAsset[];
  blocks: PaperExtractBlock[];
  /** Raw layout JSON from zip — persisted for block region upgrades on read. */
  layout?: { middle?: unknown; model?: unknown };
}

export function isMineruZipImageEntry(entry: string): boolean {
  const norm = entry.replace(/\\/g, "/").trim();
  if (!norm || norm.endsWith("/")) return false;
  if (/(^|\/)full\.md$/i.test(norm)) return false;
  return IMAGE_EXT.test(norm);
}

export function mineruImageRelPath(zipEntry: string): string {
  const norm = zipEntry.replace(/\\/g, "/").trim();
  const base = path.posix.basename(norm);
  return `images/${base}`;
}

function normalizeAssetRef(ref: string): string {
  try {
    return decodeURIComponent(ref.trim().replace(/\\/g, "/").replace(/^\.\//, ""));
  } catch {
    return ref.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  }
}

/** Rewrite markdown / HTML image refs to Prism Next-local `images/…` paths. */
export function rewriteMarkdownAssetPaths(
  markdown: string,
  images: MineruZipImageAsset[],
): string {
  if (images.length === 0) return markdown;

  const lookup = new Map<string, string>();
  for (const img of images) {
    lookup.set(img.relPath, img.relPath);
    lookup.set(path.posix.basename(img.relPath), img.relPath);
    for (const entry of img.zipEntries) {
      const norm = entry.replace(/\\/g, "/");
      lookup.set(norm, img.relPath);
      const tail = norm.includes("/") ? norm.slice(norm.indexOf("/") + 1) : norm;
      lookup.set(tail, img.relPath);
    }
  }

  const resolve = (raw: string): string => {
    const key = normalizeAssetRef(raw);
    return lookup.get(key) ?? lookup.get(path.posix.basename(key)) ?? raw;
  };

  let out = markdown.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (full, alt, ref) => {
    const next = resolve(ref);
    return next === ref ? full : `![${alt}](${next})`;
  });

  out = out.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi, (full, prefix, quote, ref) => {
    const next = resolve(ref);
    return next === ref ? full : `${prefix}${quote}${next}${quote}`;
  });

  return out;
}

async function unzipEntryToBuffer(zipPath: string, entry: string): Promise<Buffer> {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, entry], {
    maxBuffer: 100 * 1024 * 1024,
    encoding: "buffer",
  });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

/** Parse MinerU precision zip: `full.md` + image assets under `images/`. */
export async function parseMineruZipBuffer(zipBuf: Buffer): Promise<MineruZipExtractResult> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "prism-mineru-"));
  const zipPath = path.join(tmpDir, "result.zip");
  try {
    await fs.promises.writeFile(zipPath, zipBuf);
    const { stdout: listing } = await execFileAsync("unzip", ["-Z1", zipPath], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const entries = listing
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const mdEntry = entries.find((l) => /(^|\/)full\.md$/i.test(l));
    if (!mdEntry) throw new Error("MinerU zip missing full.md");

    const mdRaw = (await unzipEntryToBuffer(zipPath, mdEntry)).toString("utf-8");

    const imageEntries = entries.filter(isMineruZipImageEntry);
    const byRel = new Map<string, MineruZipImageAsset>();

    for (const entry of imageEntries) {
      const relPath = mineruImageRelPath(entry);
      const data = await unzipEntryToBuffer(zipPath, entry);
      const existing = byRel.get(relPath);
      if (existing) {
        existing.zipEntries.push(entry);
      } else {
        byRel.set(relPath, { relPath, data, zipEntries: [entry] });
      }
    }

    const images = [...byRel.values()];
    const markdown = rewriteMarkdownAssetPaths(mdRaw, images);

    let blocks: PaperExtractBlock[] = [];
    let middleJson: unknown;
    const contentListEntry = findContentListEntryName(entries);
    const middleEntry = findMiddleJsonEntryName(entries);
    const modelEntry = findModelJsonEntryName(entries);

    if (middleEntry) {
      try {
        middleJson = JSON.parse(
          (await unzipEntryToBuffer(zipPath, middleEntry)).toString("utf-8"),
        );
      } catch {
        middleJson = undefined;
      }
    }

    let modelJson: unknown;
    if (modelEntry) {
      try {
        modelJson = JSON.parse(
          (await unzipEntryToBuffer(zipPath, modelEntry)).toString("utf-8"),
        );
      } catch {
        modelJson = undefined;
      }
    }

    if (contentListEntry) {
      try {
        const rawJson = (await unzipEntryToBuffer(zipPath, contentListEntry)).toString("utf-8");
        blocks = buildMineruExtractBlocks(JSON.parse(rawJson), images, {
          middle: middleJson,
          model: modelJson,
        });
      } catch {
        blocks = [];
      }
    }

    return {
      markdown,
      images,
      blocks,
      layout: middleJson || modelJson ? { middle: middleJson, model: modelJson } : undefined,
    };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

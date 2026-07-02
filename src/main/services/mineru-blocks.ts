import type { MineruZipImageAsset } from "./mineru-zip";
import {
  assignFlowGroups,
  normalizeBbox,
  splitBboxAcrossPages,
  withBlockRegions,
  type ExtractBlockType,
  type PaperExtractBlock,
} from "../../shared/paper-extract-block";

const AUXILIARY_TYPES = new Set([
  "header",
  "footer",
  "page_number",
  "aside_text",
  "page_footnote",
  "page_header",
  "page_footer",
  "page_aside_text",
]);

const TYPE_MAP: Record<string, ExtractBlockType> = {
  text: "text",
  title: "title",
  equation: "equation",
  equation_interline: "equation",
  interline_equation: "equation",
  image: "image",
  image_body: "image",
  chart: "chart",
  chart_body: "chart",
  table: "table",
  table_body: "table",
  code: "code",
  code_body: "code",
  algorithm: "code",
  list: "list",
  index: "list",
  ref_text: "list",
  paragraph: "text",
  abstract: "text",
  phonetic: "text",
  image_caption: "text",
  chart_caption: "text",
  table_caption: "text",
  code_caption: "text",
};

function resolveImagePath(raw: string, images: MineruZipImageAsset[]): string {
  const norm = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  for (const img of images) {
    if (img.relPath === norm || img.relPath.endsWith(`/${norm}`)) return img.relPath;
    const base = norm.split("/").pop();
    if (base && img.relPath.endsWith(`/${base}`)) return img.relPath;
    for (const entry of img.zipEntries) {
      if (entry === norm || entry.endsWith(`/${norm}`)) return img.relPath;
    }
  }
  if (norm.startsWith("images/")) return norm;
  const base = norm.split("/").pop();
  return base ? `images/${base}` : norm;
}

function joinLines(parts: unknown): string {
  if (typeof parts === "string") return parts.trim();
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (typeof p === "string" ? p : String(p ?? "")))
    .join(" ")
    .trim();
}

function extractV2Text(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  for (const key of [
    "title_content",
    "paragraph_content",
    "math_content",
    "code_content",
    "algorithm_content",
    "list_items",
    "page_footnote_content",
  ]) {
    const val = c[key];
    if (typeof val === "string") return val.trim();
    if (Array.isArray(val)) {
      return val
        .map((span) => {
          if (typeof span === "string") return span;
          if (span && typeof span === "object") {
            const s = span as Record<string, unknown>;
            if (typeof s.content === "string") return s.content;
            if (Array.isArray(s.children)) {
              return s.children
                .map((ch) =>
                  ch && typeof ch === "object" && typeof (ch as { content?: string }).content === "string"
                    ? (ch as { content: string }).content
                    : "",
                )
                .join("");
            }
          }
          return "";
        })
        .join("")
        .trim();
    }
  }
  return "";
}

function blockToMarkdown(
  entry: Record<string, unknown>,
  images: MineruZipImageAsset[],
): { markdown: string; textPreview: string; type: ExtractBlockType } {
  const rawType = String(entry.type ?? "text");
  const type = TYPE_MAP[rawType] ?? "text";

  if (type === "equation") {
    const text = String(entry.text ?? extractV2Text(entry.content) ?? "").trim();
    return { markdown: text, textPreview: text.replace(/\$\$/g, "").slice(0, 120), type };
  }

  if (type === "image" || type === "chart") {
    const imgPath = String(entry.img_path ?? entry.image_path ?? "").trim();
    const resolved = imgPath ? resolveImagePath(imgPath, images) : "";
    const captions = joinLines(entry.image_caption ?? entry.chart_caption);
    const caption = captions || "Figure";
    const md = resolved ? `![${caption}](${resolved})` : caption;
    return { markdown: md, textPreview: caption.slice(0, 120), type };
  }

  if (type === "table") {
    const caption = joinLines(entry.table_caption);
    const body = String(entry.table_body ?? "").trim();
    const parts = [caption ? `**${caption}**` : "", body].filter(Boolean);
    const md = parts.join("\n\n");
    return { markdown: md, textPreview: (caption || "Table").slice(0, 120), type };
  }

  if (type === "code") {
    const body = String(entry.code_body ?? extractV2Text(entry.content) ?? "").trim();
    const caption = joinLines(entry.code_caption);
    const md = caption ? `**${caption}**\n\n\`\`\`\n${body}\n\`\`\`` : `\`\`\`\n${body}\n\`\`\``;
    return { markdown: md, textPreview: (caption || body).slice(0, 120), type };
  }

  if (type === "list") {
    const items = entry.list_items;
    let md = "";
    if (Array.isArray(items)) {
      md = items.map((item) => `- ${String(item).trim()}`).join("\n");
    } else {
      md = String(entry.text ?? extractV2Text(entry.content) ?? "").trim();
    }
    return { markdown: md, textPreview: md.slice(0, 120), type: "list" };
  }

  const textLevel = Number(
    entry.text_level ??
      (entry.content && typeof entry.content === "object"
        ? (entry.content as { level?: number }).level
        : 0) ??
      0,
  );
  const text = String(entry.text ?? extractV2Text(entry.content) ?? "").trim();
  if (type === "title" || textLevel === 1) {
    const md = text.startsWith("#") ? text : `## ${text}`;
    return { markdown: md, textPreview: text.slice(0, 120), type: "title" };
  }
  return { markdown: text, textPreview: text.slice(0, 120), type: "text" };
}

function flattenContentList(json: unknown): Record<string, unknown>[] {
  if (!Array.isArray(json)) return [];
  if (json.length === 0) return [];
  if (Array.isArray(json[0])) {
    const flat: Record<string, unknown>[] = [];
    for (let pageIdx = 0; pageIdx < json.length; pageIdx++) {
      const page = json[pageIdx];
      if (!Array.isArray(page)) continue;
      for (const item of page) {
        if (item && typeof item === "object") {
          flat.push({
            ...(item as Record<string, unknown>),
            page_idx: pageIdx,
          });
        }
      }
    }
    return flat;
  }
  return json.filter((e) => e && typeof e === "object") as Record<string, unknown>[];
}

function parsePageSize(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const w = Number(raw[0]);
  const h = Number(raw[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  return [w, h];
}

/** Normalize bbox from middle.json (PDF points) or content_list (0–1000 / 0–1). */
function normalizeBboxForPage(
  raw: unknown,
  pageSize?: [number, number],
): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.slice(0, 4).map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const max = Math.max(...nums.map(Math.abs));
  if (max <= 1.5) {
    return normalizeBbox(raw);
  }
  if (pageSize) {
    const [pw, ph] = pageSize;
    const [x0, y0, x1, y1] = nums;
    return [
      Math.min(x0, x1) / pw,
      Math.min(y0, y1) / ph,
      Math.max(x0, x1) / pw,
      Math.max(y0, y1) / ph,
    ];
  }
  return normalizeBbox(raw);
}

function extractMiddleBlockText(block: Record<string, unknown>): string {
  const lines = block.lines;
  if (Array.isArray(lines)) {
    const parts: string[] = [];
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const spans = (line as { spans?: unknown }).spans;
      if (!Array.isArray(spans)) continue;
      for (const span of spans) {
        if (span && typeof span === "object" && typeof (span as { content?: string }).content === "string") {
          parts.push((span as { content: string }).content);
        }
      }
    }
    const joined = parts.join("").trim();
    if (joined) return joined;
  }
  return String(block.text ?? "").trim();
}

function mapMiddleType(rawType: string): ExtractBlockType {
  return TYPE_MAP[rawType] ?? "text";
}

/** One MinerU preproc layout block — same unit as draw_bbox.py uses per block bbox. */
interface PreprocLeaf {
  pageIdx: number;
  type: ExtractBlockType;
  rawType: string;
  bbox: [number, number, number, number];
  text: string;
}

function flattenPreprocLeaves(
  blocks: unknown[],
  pageIdx: number,
  pageSize?: [number, number],
): PreprocLeaf[] {
  const leaves: PreprocLeaf[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const rawType = String(b.type ?? "text");
    if (AUXILIARY_TYPES.has(rawType)) continue;

    const inner = b.blocks;
    if (Array.isArray(inner) && inner.length > 0) {
      leaves.push(...flattenPreprocLeaves(inner, pageIdx, pageSize));
      continue;
    }

    const bbox = normalizeBboxForPage(b.bbox, pageSize);
    if (!bbox) continue;

    leaves.push({
      pageIdx,
      rawType,
      type: mapMiddleType(rawType),
      bbox,
      text: extractMiddleBlockText(b),
    });
  }
  return leaves;
}

/** Collect layout blocks from middle.json — preproc_blocks only (MinerU draw_bbox.py). */
export function collectPreprocLeaves(middle: unknown): PreprocLeaf[] {
  const root = middle as { pdf_info?: unknown };
  if (!Array.isArray(root.pdf_info)) return [];
  const leaves: PreprocLeaf[] = [];
  for (let i = 0; i < root.pdf_info.length; i++) {
    const page = root.pdf_info[i];
    if (!page || typeof page !== "object") continue;
    const p = page as Record<string, unknown>;
    const pageIdx = Number(p.page_idx ?? i);
    const pageSize = parsePageSize(p.page_size);
    const idx = Number.isFinite(pageIdx) ? pageIdx : i;
    const preprocBlocks = p.preproc_blocks;
    if (Array.isArray(preprocBlocks) && preprocBlocks.length > 0) {
      leaves.push(...flattenPreprocLeaves(preprocBlocks, idx, pageSize));
    }
  }
  return leaves;
}

function contentListEntries(json: unknown): Record<string, unknown>[] {
  return flattenContentList(json).filter(
    (entry) => !AUXILIARY_TYPES.has(String(entry.type ?? "text")),
  );
}

function typesCompatible(leafType: ExtractBlockType, contentType: ExtractBlockType): boolean {
  if (leafType === contentType) return true;
  if (leafType === "text" && (contentType === "title" || contentType === "list")) return true;
  if (leafType === "title" && contentType === "text") return true;
  if (leafType === "list" && contentType === "text") return true;
  return false;
}

function leafToBlock(
  leaf: PreprocLeaf,
  markdown: string,
  textPreview: string,
  index: number,
): PaperExtractBlock {
  const regions = splitBboxAcrossPages(leaf.pageIdx, leaf.bbox);
  return withBlockRegions(
    {
      id: `b${index}`,
      index,
      type: leaf.type,
      pageIdx: leaf.pageIdx,
      bbox: leaf.bbox,
      markdown,
      textPreview,
    },
    regions,
  );
}

/** Build pickable blocks from middle.json preproc_blocks + content_list markdown. */
export function buildBlocksFromMiddleJson(
  middle: unknown,
  contentList: unknown,
  images: MineruZipImageAsset[],
): PaperExtractBlock[] {
  const leaves = collectPreprocLeaves(middle);
  if (leaves.length === 0) return [];

  const entries = contentListEntries(contentList);
  const blocks: PaperExtractBlock[] = [];
  let entryIdx = 0;

  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i]!;
    while (
      entryIdx < entries.length &&
      Number(entries[entryIdx]!.page_idx ?? entries[entryIdx]!.pageIndex ?? 0) < leaf.pageIdx
    ) {
      entryIdx += 1;
    }

    let markdown = leaf.text;
    let textPreview = leaf.text.slice(0, 120);
    let type = leaf.type;

    if (entryIdx < entries.length) {
      const entry = entries[entryIdx]!;
      const entryPage = Number(entry.page_idx ?? entry.pageIndex ?? leaf.pageIdx);
      const parsed = blockToMarkdown(entry, images);
      if (entryPage === leaf.pageIdx && typesCompatible(leaf.type, parsed.type)) {
        markdown = parsed.markdown;
        textPreview = parsed.textPreview;
        type = parsed.type;
        entryIdx += 1;
      } else if (entryPage === leaf.pageIdx && leaf.text.length === 0) {
        markdown = parsed.markdown;
        textPreview = parsed.textPreview;
        type = parsed.type;
        entryIdx += 1;
      }
    }

    if (!markdown.trim()) continue;
    blocks.push(leafToBlock({ ...leaf, type }, markdown, textPreview, blocks.length));
  }

  return blocks;
}

/** Replace geometry on cached blocks using middle.json — keeps stored markdown. */
export function reapplyGeometryFromMiddle(
  blocks: PaperExtractBlock[],
  middle: unknown,
): PaperExtractBlock[] {
  const leaves = collectPreprocLeaves(middle);
  if (leaves.length === 0) return blocks;

  const result: PaperExtractBlock[] = [];
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i]!;
    const src = blocks[i];
    const markdown = src?.markdown?.trim() ? src.markdown : leaf.text;
    if (!markdown.trim()) continue;
    result.push(
      leafToBlock(
        leaf,
        markdown,
        src?.textPreview ?? leaf.text.slice(0, 120),
        result.length,
      ),
    );
  }
  return result;
}

function buildBlocksFromModelJson(
  model: unknown,
  contentList: unknown,
  images: MineruZipImageAsset[],
): PaperExtractBlock[] {
  if (!Array.isArray(model)) return [];
  const leaves: PreprocLeaf[] = [];
  for (let pageIdx = 0; pageIdx < model.length; pageIdx++) {
    const page = model[pageIdx];
    if (!Array.isArray(page)) continue;
    for (const item of page) {
      if (!item || typeof item !== "object") continue;
      const b = item as Record<string, unknown>;
      const rawType = String(b.type ?? "text");
      if (AUXILIARY_TYPES.has(rawType)) continue;
      const bbox = normalizeBbox(b.bbox);
      if (!bbox) continue;
      leaves.push({
        pageIdx,
        rawType,
        type: mapMiddleType(rawType),
        bbox,
        text: String(b.content ?? b.text ?? "").trim(),
      });
    }
  }
  if (leaves.length === 0) return [];
  return buildBlocksFromMiddleJson(
    {
      pdf_info: leaves.reduce<Array<Record<string, unknown>>>((pages, leaf) => {
        let page = pages.find((p) => p.page_idx === leaf.pageIdx);
        if (!page) {
          page = { page_idx: leaf.pageIdx, preproc_blocks: [] };
          pages.push(page);
        }
        (page.preproc_blocks as unknown[]).push({
          type: leaf.rawType,
          bbox: leaf.bbox,
          text: leaf.text,
        });
        return pages;
      }, []),
    },
    contentList,
    images,
  );
}

export function enrichBlocksWithLayoutJson(
  blocks: PaperExtractBlock[],
  layout: { middle?: unknown; model?: unknown },
): PaperExtractBlock[] {
  if (layout.middle) {
    return reapplyGeometryFromMiddle(blocks, layout.middle);
  }
  return blocks;
}

/** MinerU pipeline: preproc block geometry + content_list markdown. */
export function buildMineruExtractBlocks(
  contentList: unknown,
  images: MineruZipImageAsset[],
  layout: { middle?: unknown; model?: unknown },
): PaperExtractBlock[] {
  if (layout.middle) {
    const fromMiddle = buildBlocksFromMiddleJson(layout.middle, contentList, images);
    if (fromMiddle.length > 0) return finalizeExtractBlocks(fromMiddle);
  }
  if (layout.model) {
    const fromModel = buildBlocksFromModelJson(layout.model, contentList, images);
    if (fromModel.length > 0) return finalizeExtractBlocks(fromModel);
  }
  return finalizeExtractBlocks(buildBlocksFromContentList(contentList, images));
}

/** @deprecated Use enrichBlocksWithLayoutJson */
export function enrichBlocksWithMiddleJson(
  blocks: PaperExtractBlock[],
  middle: unknown,
): PaperExtractBlock[] {
  return enrichBlocksWithLayoutJson(blocks, { middle });
}

export function finalizeExtractBlocks(blocks: PaperExtractBlock[]): PaperExtractBlock[] {
  const normalized = blocks.map((block, index) => {
    const regions = block.regions?.length
      ? block.regions
      : splitBboxAcrossPages(block.pageIdx, block.bbox);
    return { ...block, id: `b${index}`, index, regions };
  });
  return assignFlowGroups(normalized);
}

export function findMiddleJsonEntryName(entries: string[]): string | null {
  const norm = entries.map((e) => e.replace(/\\/g, "/"));
  return (
    norm.find((e) => /(^|\/)middle\.json$/i.test(e)) ??
    norm.find((e) => /_middle\.json$/i.test(e)) ??
    norm.find((e) => /(^|\/)layout\.json$/i.test(e)) ??
    norm.find((e) => /_layout\.json$/i.test(e)) ??
    null
  );
}

export function findModelJsonEntryName(entries: string[]): string | null {
  const norm = entries.map((e) => e.replace(/\\/g, "/"));
  return (
    norm.find((e) => /(^|\/)model\.json$/i.test(e)) ??
    norm.find((e) => /_model\.json$/i.test(e)) ??
    null
  );
}

export function buildBlocksFromContentList(
  json: unknown,
  images: MineruZipImageAsset[],
): PaperExtractBlock[] {
  const entries = contentListEntries(json);
  const blocks: PaperExtractBlock[] = [];
  let index = 0;

  for (const entry of entries) {
    const pageIdx = Number(entry.page_idx ?? entry.pageIndex ?? 0);
    const bbox = normalizeBbox(entry.bbox);
    if (!bbox) continue;

    const { markdown, textPreview, type } = blockToMarkdown(entry, images);
    if (!markdown.trim()) continue;

    const resolvedPageIdx = Number.isFinite(pageIdx) ? pageIdx : 0;
    blocks.push(
      withBlockRegions(
        {
          id: `b${index}`,
          index,
          type,
          pageIdx: resolvedPageIdx,
          bbox,
          markdown,
          textPreview,
        },
        splitBboxAcrossPages(resolvedPageIdx, bbox),
      ),
    );
    index += 1;
  }

  return blocks;
}

export function findContentListEntryName(entries: string[]): string | null {
  const v1 = entries.find((e) => /content_list\.json$/i.test(e.replace(/\\/g, "/")));
  if (v1) return v1;
  return (
    entries.find((e) => /content_list_v2\.json$/i.test(e.replace(/\\/g, "/"))) ?? null
  );
}

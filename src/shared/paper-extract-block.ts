export type ExtractBlockType =
  | "text"
  | "title"
  | "equation"
  | "image"
  | "table"
  | "chart"
  | "code"
  | "list"
  | "discarded";

export interface PaperExtractBlock {
  /** Stable id in reading order, e.g. `b42`. */
  id: string;
  index: number;
  type: ExtractBlockType;
  /** 0-based MinerU page index (primary page — first region when `regions` is set). */
  pageIdx: number;
  /** Normalized bounding box [x0, y0, x1, y1] in 0–1 page space (union / legacy). */
  bbox: [number, number, number, number];
  /** Optional per-line / per-column / cross-page regions for hit-testing and overlays. */
  regions?: PaperExtractBlockRegion[];
  /** Markdown snippet ready for Chat (LaTeX / HTML / local image paths). */
  markdown: string;
  /** Short plain-text label for UI tooltips. */
  textPreview?: string;
  /** Linked layout fragments (cross-column / cross-page continuation). */
  flowGroupId?: string;
}

export interface PaperExtractBlockRegion {
  pageIdx: number;
  bbox: [number, number, number, number];
}

export interface NormalizedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** MinerU bbox may be 0–1000 ints or 0–1 floats. */
export function normalizeBbox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.slice(0, 4).map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const max = Math.max(...nums.map(Math.abs));
  const scale = max <= 1.5 ? 1 : 1 / 1000;
  const [x0, y0, x1, y1] = nums.map((n) => n * scale) as [number, number, number, number];
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const right = Math.max(x0, x1);
  const bottom = Math.max(y0, y1);
  return [left, top, right, bottom];
}

export function bboxToRect(bbox: [number, number, number, number]): NormalizedRect {
  const [x0, y0, x1, y1] = bbox;
  return {
    left: x0,
    top: y0,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0),
  };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function bboxArea(bbox: [number, number, number, number]): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

/** Intersection-over-union for two normalized bboxes (0–1 page space). */
export function bboxIntersectionOverUnion(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter <= 0) return 0;
  const union = bboxArea(a) + bboxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** True when block regions are specific layout slices (not whole-page placeholders). */
export function blockLayoutLooksPrecise(block: PaperExtractBlock): boolean {
  for (const region of blockRegions(block)) {
    const area = bboxArea(region.bbox);
    if (area > 1e-6 && area < 0.92) return true;
  }
  return false;
}

/** Split a bbox that spills below/above the 0–1 page band into per-page segments. */
export function splitBboxAcrossPages(
  pageIdx: number,
  bbox: [number, number, number, number],
): PaperExtractBlockRegion[] {
  const [rawX0, rawY0, rawX1, rawY1] = bbox;
  const x0 = Math.min(rawX0, rawX1);
  const x1 = Math.max(rawX0, rawX1);
  let y0 = Math.min(rawY0, rawY1);
  let y1 = Math.max(rawY0, rawY1);
  let page = pageIdx;
  const regions: PaperExtractBlockRegion[] = [];

  while (y0 < -1e-6) {
    y0 += 1;
    y1 += 1;
    page -= 1;
  }

  while (y1 - y0 > 1e-6) {
    const segY0 = clamp01(y0);
    const segY1 = Math.min(y1, 1);
    if (segY1 - segY0 > 1e-6) {
      regions.push({
        pageIdx: page,
        bbox: [clamp01(x0), segY0, clamp01(x1), segY1],
      });
    }
    if (y1 <= 1 + 1e-6) break;
    page += 1;
    y0 = 0;
    y1 -= 1;
  }

  if (regions.length === 0) {
    regions.push({
      pageIdx,
      bbox: [clamp01(x0), clamp01(y0), clamp01(x1), clamp01(y1)],
    });
  }
  return regions;
}

/** All hit-test / overlay regions for a block (falls back to pageIdx+bbox). */
export function blockRegions(block: PaperExtractBlock): PaperExtractBlockRegion[] {
  if (block.regions?.length) return block.regions;
  return splitBboxAcrossPages(block.pageIdx, block.bbox);
}

export type BlockPagePlacement = {
  block: PaperExtractBlock;
  bbox: [number, number, number, number];
  regionIndex: number;
};

export function buildBlockPlacementsByPage(
  blocks: PaperExtractBlock[],
): Map<number, BlockPagePlacement[]> {
  const map = new Map<number, BlockPagePlacement[]>();
  for (const block of blocks) {
    blockRegions(block).forEach((region, regionIndex) => {
      const list = map.get(region.pageIdx) ?? [];
      list.push({ block, bbox: region.bbox, regionIndex });
      map.set(region.pageIdx, list);
    });
  }
  return map;
}

function unionBbox(regions: PaperExtractBlockRegion[]): [number, number, number, number] {
  if (regions.length === 0) return [0, 0, 0, 0];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of regions) {
    x0 = Math.min(x0, r.bbox[0]);
    y0 = Math.min(y0, r.bbox[1]);
    x1 = Math.max(x1, r.bbox[2]);
    y1 = Math.max(y1, r.bbox[3]);
  }
  return [x0, y0, x1, y1];
}

/** Attach `regions` and refresh primary pageIdx/bbox from region union. */
export function withBlockRegions(
  block: Omit<PaperExtractBlock, "regions"> & { regions?: PaperExtractBlockRegion[] },
  regions: PaperExtractBlockRegion[],
): PaperExtractBlock {
  const cleaned = regions.filter((r) => bboxArea(r.bbox) > 1e-8);
  const finalRegions = cleaned.length > 0 ? cleaned : blockRegions(block as PaperExtractBlock);
  const sorted = [...finalRegions].sort(
    (a, b) => a.pageIdx - b.pageIdx || a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0],
  );
  return {
    ...block,
    pageIdx: sorted[0]?.pageIdx ?? block.pageIdx,
    bbox: unionBbox(sorted),
    regions: sorted,
  };
}

function pointInBbox(
  bbox: [number, number, number, number],
  x: number,
  y: number,
): boolean {
  const [x0, y0, x1, y1] = bbox;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function rectOverlapArea(
  a: [number, number, number, number],
  b: NormalizedRect,
): number {
  const ax1 = a[2];
  const ay1 = a[3];
  const bx1 = b.left + b.width;
  const by1 = b.top + b.height;
  const overlapW = Math.max(0, Math.min(ax1, bx1) - Math.max(a[0], b.left));
  const overlapH = Math.max(0, Math.min(ay1, by1) - Math.max(a[1], b.top));
  return overlapW * overlapH;
}

/** Pick the topmost layout block containing (x,y) — smallest bbox wins on overlap. */
export function hitTestBlock(
  blocks: PaperExtractBlock[],
  pageIdx: number,
  x: number,
  y: number,
): PaperExtractBlock | null {
  let best: PaperExtractBlock | null = null;
  let bestArea = Infinity;
  for (const block of blocks) {
    for (const region of blockRegions(block)) {
      if (region.pageIdx !== pageIdx) continue;
      if (!pointInBbox(region.bbox, x, y)) continue;
      const area = bboxArea(region.bbox);
      if (area < bestArea) {
        bestArea = area;
        best = block;
      } else if (area === bestArea && best && block.index > best.index) {
        best = block;
      }
    }
  }
  return best;
}

/** Blocks with any region on `pageIdx` overlapping `rect` (normalized page coords). */
export function blocksOverlappingRect(
  blocks: PaperExtractBlock[],
  pageIdx: number,
  rect: NormalizedRect,
  minOverlapRatio = 0.05,
): PaperExtractBlock[] {
  const rectArea = Math.max(rect.width * rect.height, 1e-9);
  const hits: PaperExtractBlock[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    for (const region of blockRegions(block)) {
      if (region.pageIdx !== pageIdx) continue;
      const overlap = rectOverlapArea(region.bbox, rect);
      const blockArea = Math.max(bboxArea(region.bbox), 1e-9);
      const ratio = overlap / Math.min(rectArea, blockArea);
      if (ratio >= minOverlapRatio && !seen.has(block.id)) {
        seen.add(block.id);
        hits.push(block);
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

const FLOW_GROUP_TYPES = new Set<ExtractBlockType>(["text", "title", "list"]);

export function flowGroupKey(block: PaperExtractBlock): string {
  return block.flowGroupId ?? block.id;
}

export function getFlowGroupMembers(
  allBlocks: PaperExtractBlock[],
  block: PaperExtractBlock,
): PaperExtractBlock[] {
  const key = flowGroupKey(block);
  return allBlocks.filter((b) => flowGroupKey(b) === key).sort((a, b) => a.index - b.index);
}

function compactPlain(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

function stripMarkdownLite(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .trim();
}

function endsMidSentence(text: string): boolean {
  const t = stripMarkdownLite(text);
  if (!t) return false;
  return !/[.!?:;"'\u201d\u2019)\]]$/.test(t.slice(-1));
}

function startsContinuation(text: string): boolean {
  const t = stripMarkdownLite(text);
  if (!t) return false;
  return /^[-a-z(\u2018\u201c,]/.test(t);
}

function bboxXMid(bbox: [number, number, number, number]): number {
  return (bbox[0] + bbox[2]) / 2;
}

/** Cross-column: left column bottom → right column top on the same page. */
function isCrossColumnFlow(prev: PaperExtractBlock, curr: PaperExtractBlock): boolean {
  if (prev.pageIdx !== curr.pageIdx) return false;
  if (bboxXMid(prev.bbox) >= 0.5 || bboxXMid(curr.bbox) <= 0.48) return false;
  return prev.bbox[3] >= 0.45 && curr.bbox[1] <= 0.55;
}

/** Cross-page: bottom of page N → top of page N+1. */
function isCrossPageFlow(prev: PaperExtractBlock, curr: PaperExtractBlock): boolean {
  if (curr.pageIdx !== prev.pageIdx + 1) return false;
  return prev.bbox[3] >= 0.55 && curr.bbox[1] <= 0.45;
}

function shouldLinkFlow(prev: PaperExtractBlock, curr: PaperExtractBlock): boolean {
  if (!FLOW_GROUP_TYPES.has(prev.type) || !FLOW_GROUP_TYPES.has(curr.type)) return false;
  if (prev.type !== curr.type) return false;
  if (curr.index !== prev.index + 1) return false;

  const layout = isCrossColumnFlow(prev, curr) || isCrossPageFlow(prev, curr);
  if (!layout) return false;

  return (
    endsMidSentence(prev.markdown) ||
    startsContinuation(curr.markdown) ||
    isCrossColumnFlow(prev, curr)
  );
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]!);
    return this.parent[i]!;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/** Link cross-column / cross-page text fragments (MinerU preproc splits). */
export function assignFlowGroups(blocks: PaperExtractBlock[]): PaperExtractBlock[] {
  if (blocks.length === 0) return blocks;
  const uf = new UnionFind(blocks.length);
  for (let i = 1; i < blocks.length; i++) {
    if (shouldLinkFlow(blocks[i - 1]!, blocks[i]!)) {
      uf.union(i - 1, i);
    }
  }

  const rootToId = new Map<number, string>();
  let groupSeq = 0;
  return blocks.map((block, i) => {
    const root = uf.find(i);
    let groupId = rootToId.get(root);
    if (!groupId) {
      groupId = `fg${groupSeq}`;
      groupSeq += 1;
      rootToId.set(root, groupId);
    }
    const members = blocks.filter((_, j) => uf.find(j) === root);
    if (members.length <= 1) {
      return { ...block, flowGroupId: undefined };
    }
    return { ...block, flowGroupId: groupId };
  });
}

export function mergeFlowGroupMarkdown(members: PaperExtractBlock[]): string {
  const sorted = [...members].sort((a, b) => a.index - b.index);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return sorted[0]!.markdown.trim();

  const first = sorted[0]!.markdown.trim();
  const firstPlain = compactPlain(stripMarkdownLite(first));
  const rest = sorted.slice(1);
  const restContained = rest.every((b) => {
    const plain = compactPlain(stripMarkdownLite(b.markdown));
    return !plain || firstPlain.includes(plain);
  });
  if (restContained && first.length > 0) return first;

  return sorted
    .map((b) => b.markdown.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function mergeBlockMarkdown(
  blocks: PaperExtractBlock[],
  allBlocks?: PaperExtractBlock[],
): string {
  const pool = allBlocks ?? blocks;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const block of [...blocks].sort((a, b) => a.index - b.index)) {
    const key = flowGroupKey(block);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(mergeFlowGroupMarkdown(getFlowGroupMembers(pool, block)));
  }
  return parts.filter(Boolean).join("\n\n");
}

export function collectEmphasizedBlockIds(
  blocks: PaperExtractBlock[],
  hoveredBlockId: string | null,
  selectedBlockIds: string[],
): Set<string> {
  const ids = new Set<string>();
  const addGroupFor = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    for (const member of getFlowGroupMembers(blocks, block)) {
      ids.add(member.id);
    }
  };
  for (const id of selectedBlockIds) addGroupFor(id);
  if (hoveredBlockId) addGroupFor(hoveredBlockId);
  return ids;
}

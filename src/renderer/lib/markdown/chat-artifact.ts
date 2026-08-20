/**
 * Chat artifact fence helpers — explicit ```artifact blocks in AI replies.
 *
 * Terminology: "artifact" here means **project file path embed**, not Interaction specs
 * (`.prismnext/interactions/<id>/spec.json` — see interaction-spec.ts and ```interaction fences).
 * See docs-private/superpowers/specs/2026-07-18-chat-artifact-block-design.md
 */
import {
  artifactBasename,
  isImageArtifactPath,
  isPdfArtifactPath,
  normalizeArtifactSlash,
} from "../../../shared/artifact-path";
import { parseKeyedFenceBody } from "../../../shared/chat-fence-parse";
import type { ToolOutcomeResource } from "../../../shared/agent-runtime";

export type ChatArtifactKind = "image" | "pdf" | "generic";

export type ParsedArtifactFence = {
  path: string;
  title?: string;
};

/** Max auto-injected artifact blocks per assistant message. */
export const CHAT_ARTIFACT_AUTO_CAP = 5;

/** Outer shell for PDF / interaction file cards (header + peek). */
export const CHAT_ARTIFACT_THUMB_SHELL_CLASS =
  "my-2 w-full max-w-full overflow-hidden rounded-lg border border-border-subtle bg-muted/20";

/**
 * Inline chat image — single thin border, light padding, content-driven height.
 * Used by markdown `![](path)`, literature figures, and experiment image artifacts.
 */
export const CHAT_ARTIFACT_INLINE_IMAGE_FRAME_CLASS =
  "my-2 block w-full max-w-full overflow-hidden rounded-lg border border-border-subtle bg-background p-1.5 text-left transition-opacity hover:opacity-95";

export const CHAT_ARTIFACT_INLINE_IMAGE_CLASS =
  "block w-full h-auto max-h-[min(28rem,70vh)] object-contain";

/** Padding wrapper for image peek areas inside PDF / interaction file cards. */
export const CHAT_ARTIFACT_PEEK_BODY_CLASS =
  "border-t border-border-subtle p-1.5";

/** Fixed viewport for interaction plot hosts (needs measurable height). */
export const CHAT_ARTIFACT_THUMB_PREVIEW_CLASS =
  "flex h-52 w-full items-center justify-center overflow-hidden rounded-md bg-background/80";

export const CHAT_ARTIFACT_THUMB_IMAGE_CLASS = CHAT_ARTIFACT_INLINE_IMAGE_CLASS;

export function classifyArtifactKind(path: string): ChatArtifactKind {
  if (isImageArtifactPath(path)) return "image";
  if (isPdfArtifactPath(path)) return "pdf";
  return "generic";
}

export type OutcomePresentKind = "preview" | "chip" | "card" | "skip";

/** How Conversation should present one host-authored outcome resource. */
export function presentOutcomeResource(resource: ToolOutcomeResource): OutcomePresentKind {
  if (resource.type === "entity") {
    return resource.system === "interaction" ? "card" : "skip";
  }
  const kind = classifyArtifactKind(resource.path);
  return kind === "image" || kind === "pdf" ? "preview" : "chip";
}

export function toolOutcomeResourceKey(resource: ToolOutcomeResource): string {
  if (resource.type === "entity") return `entity:${resource.system}:${resource.id}`;
  return normalizeArtifactSlash(resource.path);
}

/**
 * Parse ```artifact fence body: `path:` / `title:` lines (unknown keys ignored).
 * Fallback: first non-empty line is the path.
 */
export function parseArtifactFenceContent(raw: string): ParsedArtifactFence | null {
  const parsed = parseKeyedFenceBody(raw, "path");
  if (!parsed) return null;
  const path = normalizeArtifactSlash(parsed.primary);
  if (!path) return null;
  return { path, title: parsed.title };
}

export function normalizeArtifactDisplayPath(path: string): string {
  return normalizeArtifactSlash(path);
}

/** Build a single ```artifact fence for reply fallback / agent examples. */
export function buildArtifactFenceMarkdown(path: string, title?: string): string {
  const p = normalizeArtifactSlash(path);
  const t = (title || artifactBasename(p) || p).trim();
  return ["```artifact", `path: ${p}`, `title: ${t}`, "```"].join("\n");
}

function pushVisualPath(out: string[], raw: string): void {
  const p = normalizeArtifactSlash(raw);
  if (!p) return;
  if (classifyArtifactKind(p) === "generic") return;
  out.push(p);
}

/** Paths already present as ```artifact fences, markdown images, or visual file links. */
export function collectEmbeddedArtifactPaths(text: string): string[] {
  const out: string[] = [];
  const fenceRe = /```artifact\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const parsed = parseArtifactFenceContent(m[1] ?? "");
    if (parsed?.path) out.push(parsed.path);
  }
  const imgRe = /!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g;
  while ((m = imgRe.exec(text)) !== null) {
    const p = normalizeArtifactSlash(m[1] ?? "");
    if (p) out.push(p);
  }
  const linkRe = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?\s*\)/g;
  while ((m = linkRe.exec(text)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (/^https?:\/\//i.test(raw)) continue;
    pushVisualPath(out, raw);
  }
  const tickRe = /`([^`\n]+)`/g;
  while ((m = tickRe.exec(text)) !== null) {
    pushVisualPath(out, m[1] ?? "");
  }
  return out;
}

/** Extensions chat previews as a figure (image inline / PDF peek). */
const CHAT_VISUAL_ARTIFACT_EXT = /\.(png|jpe?g|gif|webp|svg|pdf)$/i;

/** Group key for one logical figure: basename minus visual extension. */
export function visualStemKey(path: string): string | null {
  const base = artifactBasename(path);
  if (!base || !CHAT_VISUAL_ARTIFACT_EXT.test(base)) return null;
  return base.replace(CHAT_VISUAL_ARTIFACT_EXT, "").toLowerCase();
}

/** Exact path, same basename (working ↔ snapshot), or same visual stem (png ↔ pdf). */
export function artifactPathMatchesAny(
  path: string,
  candidates: readonly string[],
): boolean {
  const norm = normalizeArtifactSlash(path);
  if (!norm || !candidates.length) return false;
  const base = artifactBasename(norm);
  const stem = visualStemKey(norm);
  for (const c of candidates) {
    const n = normalizeArtifactSlash(c);
    if (!n) continue;
    if (n === norm) return true;
    if (base && artifactBasename(n) === base) return true;
    if (stem && visualStemKey(n) === stem) return true;
  }
  return false;
}

/** Representative preference: image over PDF; frozen snapshot over working path. */
function visualRank(path: string): number {
  const base = artifactBasename(path);
  const kindScore = isImageArtifactPath(base) ? 2 : isPdfArtifactPath(base) ? 1 : 0;
  const snapshotBonus = /\/artifacts\/run-/.test(normalizeArtifactSlash(path)) ? 1 : 0;
  return kindScore * 2 + snapshotBonus;
}

/**
 * One chat preview per logical figure. A run often registers the same figure
 * as PDF + PNG/SVG, and repeated runs surface both the working path and the
 * frozen snapshot — identical pixels each. Collapse same-stem visual paths to
 * one representative (image over PDF, snapshot over working, freshest wins
 * ties). Non-visual files (csv, json, …) are never collapsed, and the first
 * occurrence's position is kept so display order stays stable.
 */
export function collapseVisualArtifactPaths(paths: string[]): string[] {
  const bestByStem = new Map<string, { path: string; rank: number }>();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = normalizeArtifactSlash(raw);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    const stem = visualStemKey(p);
    if (stem == null) {
      out.push(p);
      continue;
    }
    const rank = visualRank(p);
    const hit = bestByStem.get(stem);
    if (!hit) {
      bestByStem.set(stem, { path: p, rank });
      out.push(p);
      continue;
    }
    if (rank >= hit.rank) {
      const idx = out.indexOf(hit.path);
      if (idx >= 0) out[idx] = p;
      hit.path = p;
      hit.rank = rank;
    }
  }
  return out;
}

/**
 * Paths for a tool-card gallery: display list minus reply embeds / fallback.
 * Caps at {@link CHAT_ARTIFACT_AUTO_CAP} (same as reply auto-fallback).
 */
export function resolveToolCardGalleryPaths(
  displayPaths: string[],
  suppressPaths: readonly string[] = [],
  cap: number = CHAT_ARTIFACT_AUTO_CAP,
): { paths: string[]; overflow: number } {
  const filtered = displayPaths.filter(
    (p) => !artifactPathMatchesAny(p, suppressPaths),
  );
  const paths = filtered.slice(0, Math.max(0, cap));
  return { paths, overflow: Math.max(0, filtered.length - paths.length) };
}

/**
 * Whether prose already embeds this path via artifact fence or markdown image.
 * Exact path match, or same basename (covers working path vs artifactSnapshots).
 */
export function assistantTextEmbedsArtifactPath(
  text: string,
  projectRelPath: string,
): boolean {
  if (!text || !projectRelPath) return false;
  const norm = normalizeArtifactSlash(projectRelPath);
  if (!norm) return false;
  const base = artifactBasename(norm);
  const stem = visualStemKey(norm);
  for (const embedded of collectEmbeddedArtifactPaths(text)) {
    if (embedded === norm) return true;
    if (base && artifactBasename(embedded) === base) return true;
    if (stem && visualStemKey(embedded) === stem) return true;
  }
  return false;
}

export function missingArtifactPathsInText(
  textCorpus: string,
  paths: string[],
): string[] {
  return paths.filter((p) => !assistantTextEmbedsArtifactPath(textCorpus, p));
}

/**
 * Build fallback markdown: up to {@link CHAT_ARTIFACT_AUTO_CAP} fences,
 * plus a short overflow note.
 */
export function buildArtifactFallbackMarkdown(paths: string[]): string {
  if (!paths.length) return "";
  const capped = paths.slice(0, CHAT_ARTIFACT_AUTO_CAP);
  const overflow = paths.length - capped.length;
  const lines = ["本次运行的结果文件如下：", ""];
  for (const p of capped) {
    lines.push(buildArtifactFenceMarkdown(p), "");
  }
  if (overflow > 0) {
    lines.push(`另有 ${overflow} 个文件未全部展示 — 可在 Experiments 中查看完整 Artifacts。`);
  }
  return lines.join("\n").trim();
}

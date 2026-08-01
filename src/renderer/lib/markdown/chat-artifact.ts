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

export type ChatArtifactKind = "image" | "pdf" | "generic";

export type ParsedArtifactFence = {
  path: string;
  title?: string;
};

/** Max auto-injected artifact blocks per assistant message. */
export const CHAT_ARTIFACT_AUTO_CAP = 5;

/** Fixed preview viewport for inline chat image/PDF thumbnails (`object-contain` inside). */
export const CHAT_ARTIFACT_THUMB_SHELL_CLASS =
  "my-2 w-full max-w-full overflow-hidden rounded-lg border border-border-subtle bg-muted/20";

export const CHAT_ARTIFACT_THUMB_PREVIEW_CLASS =
  "flex h-52 w-full items-center justify-center overflow-hidden rounded-md bg-background/80";

export const CHAT_ARTIFACT_THUMB_IMAGE_CLASS = "max-h-full max-w-full object-contain";

export const CHAT_ARTIFACT_THUMB_PDF_IMAGE_CLASS =
  "max-h-full max-w-full rounded-md bg-white object-contain";

export function classifyArtifactKind(path: string): ChatArtifactKind {
  if (isImageArtifactPath(path)) return "image";
  if (isPdfArtifactPath(path)) return "pdf";
  return "generic";
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

/** Paths already present as ```artifact fences or markdown images in prose. */
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
  return out;
}

/** Exact path or same basename (working path ↔ snapshot). */
export function artifactPathMatchesAny(
  path: string,
  candidates: readonly string[],
): boolean {
  const norm = normalizeArtifactSlash(path);
  if (!norm || !candidates.length) return false;
  const base = artifactBasename(norm);
  for (const c of candidates) {
    const n = normalizeArtifactSlash(c);
    if (!n) continue;
    if (n === norm) return true;
    if (base && artifactBasename(n) === base) return true;
  }
  return false;
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
  for (const embedded of collectEmbeddedArtifactPaths(text)) {
    if (embedded === norm) return true;
    if (base && artifactBasename(embedded) === base) return true;
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

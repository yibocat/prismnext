/**
 * Normalize Agent scene.js toward the host loader before hard bans / eval.
 * Strips common Three ESM imports, remaps init() → mount(), wraps bare bodies.
 */

import {
  hasSceneEntryExport,
  stripJsCommentsForContract,
} from "./interaction-scene-contract";

export type NormalizedSceneSource = {
  source: string;
  strippedImports: boolean;
  remappedInit: boolean;
  wrappedBareBody: boolean;
};

const THREE_IMPORT_LINE =
  /^\s*import\s+(?:\*\s+as\s+\w+|\w+|\{[^}]*\})\s+from\s*['"]three(?:\/[^'"]*)?['"]\s*;?\s*$/gm;

/**
 * Best-effort rewrite so standard “Three.js page” / bare mount-body Agent output can load.
 * Does not invent physics — only structural remaps toward the host contract.
 */
export function normalizeSceneSourceForHost(raw: string): NormalizedSceneSource {
  let source = (raw ?? "").replace(/^\uFEFF/, "");
  let strippedImports = false;
  let remappedInit = false;
  let wrappedBareBody = false;

  const stripped = source.replace(THREE_IMPORT_LINE, "");
  if (stripped !== source) {
    source = stripped;
    strippedImports = true;
  }

  if (/\bexport\s+(?:async\s+)?function\s+init\b/.test(source)) {
    source = source.replace(
      /\bexport\s+(async\s+)?function\s+init\b/g,
      "export $1function mount",
    );
    remappedInit = true;
  } else if (/\bexport\s+(?:const|let|var)\s+init\s*=/.test(source)) {
    source = source.replace(
      /\bexport\s+(const|let|var)\s+init\s*=/g,
      "export $1 mount =",
    );
    remappedInit = true;
  }

  // Agents often emit the mount body with top-level await / ctx.* and forget export.
  if (!hasSceneEntryExport(source)) {
    const text = stripJsCommentsForContract(source);
    if (/\bctx\./.test(text) || /\bawait\s+/.test(text)) {
      source = `export async function mount(ctx) {\n${source.trim()}\n}\n`;
      wrappedBareBody = true;
    }
  }

  return { source, strippedImports, remappedInit, wrappedBareBody };
}

/** Self-managed WebGL page (no ctx.three.ensure) — route to legacy canvas shim. */
export function isPageStyleSceneSource(source: string): boolean {
  const text = stripJsCommentsForContract(source.replace(/^\uFEFF/, ""));
  if (/\bctx\.three\.ensure\s*\(/.test(text)) return false;
  if (/\bnew\s+(?:\w+\.)?WebGLRenderer\b/.test(text)) return true;
  if (/\bOrbitControls\b/.test(text)) return true;
  return false;
}

/** mount(fn) looks like mount(container) rather than mount(ctx). */
export function sceneMountLooksLikeContainerArg(source: string): boolean {
  const text = stripJsCommentsForContract(source.replace(/^\uFEFF/, ""));
  if (/\bfunction\s+mount\s*\(\s*ctx\b/.test(text)) return false;
  if (/\bmount\s*=\s*(?:async\s*)?\(\s*ctx\b/.test(text)) return false;
  if (/\bctx\.(?:canvas|THREE|el|bindings|three|setStatus)\b/.test(text)) return false;
  return (
    /\bfunction\s+mount\s*\(\s*[A-Za-z_$][\w$]*\b/.test(text) ||
    /\bmount\s*=\s*(?:async\s*)?\(\s*[A-Za-z_$][\w$]*\b/.test(text)
  );
}

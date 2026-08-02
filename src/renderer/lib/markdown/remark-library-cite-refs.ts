/**
 * Remark plugin: transforms library citation markers into markdown link nodes with a
 * `library-cite:bibkey` URL scheme for inline library citation chips in chat.
 *
 * Matches:
 * - `[@citekey]` always (BibTeX-style; whitespace inside brackets normalized)
 * - `@citekey` when citekey is in `knownBibkeys` (avoids @expert false positives)
 * - `` `citekey` `` inline code when citekey is in `knownBibkeys`
 *
 * Skips text inside link/code/math nodes (except vetted inlineCode bibkeys).
 */
import { normalizeLibraryCiteMarkers } from "../../../shared/normalize-library-cite-markers";
import { encodeLibraryFigureHref } from "@shared/paper-extract-images";
export interface RemarkLibraryCiteRefsOptions {
  /** When set, bare `@bibkey` and `` `bibkey` `` only link for keys in the library. */
  knownBibkeys?: ReadonlySet<string>;
}

/** BibTeX-style cite keys — alphanumeric first, then letters/digits/colon/underscore/hyphen. */
const BIBKEY_BODY = "[A-Za-z0-9][A-Za-z0-9:_-]*";
const BRACKETED_LIBRARY_RE = new RegExp(`\\[@(${BIBKEY_BODY})(?:\\|([^\\]]+))?\\]`, "g");
const BARE_AT_CITE_RE = new RegExp(`(?<!\\[)@(${BIBKEY_BODY})`, "g");

/** Task / expert @mentions — never treat as library bibkeys. */
const RESERVED_AT_MENTIONS = new Set([
  "literature-synthesizer",
  "research-design-coach",
  "methodology-auditor",
  "structure-diagnostician",
  "peer-reviewer",
  "research-prism",
  "general",
  "explore",
  "scout",
  "plan",
  "build",
]);

interface TextNode {
  type: "text";
  value: string;
}

interface InlineCodeNode {
  type: "inlineCode";
  value: string;
}

interface LinkNode {
  type: "link";
  url: string;
  title: null;
  children: TextNode[];
}

interface ParentNode {
  type: string;
  children?: (TextNode | LinkNode | InlineCodeNode | ParentNode)[];
}

function isReservedAtMention(bibkey: string): boolean {
  return RESERVED_AT_MENTIONS.has(bibkey.toLowerCase());
}

function shouldLinkBareBibkey(bibkey: string, knownBibkeys?: ReadonlySet<string>): boolean {
  if (isReservedAtMention(bibkey)) return false;
  if (!knownBibkeys || knownBibkeys.size === 0) return false;
  return knownBibkeys.has(bibkey);
}

function libraryLinkNode(bibkey: string, label: string): LinkNode {
  return {
    type: "link",
    url: `library-cite:${encodeURIComponent(bibkey)}`,
    title: null,
    children: [{ type: "text", value: label }],
  };
}

function libraryFigureLinkNode(bibkey: string, imageRel: string, label: string): LinkNode {
  return {
    type: "link",
    url: encodeLibraryFigureHref(bibkey, imageRel),
    title: null,
    children: [{ type: "text", value: label }],
  };
}

function parseBracketedLibraryCites(value: string): (TextNode | LinkNode)[] {
  const out: (TextNode | LinkNode)[] = [];
  let lastEnd = 0;
  for (const m of value.matchAll(BRACKETED_LIBRARY_RE)) {
    const start = m.index!;
    if (start > lastEnd) {
      out.push({ type: "text", value: value.slice(lastEnd, start) });
    }
    const bibkey = m[1]!;
    const imageRel = m[2]?.trim();
    if (imageRel) {
      out.push(
        libraryFigureLinkNode(bibkey, imageRel, `[@${bibkey}|${imageRel}]`),
      );
    } else {
      out.push(libraryLinkNode(bibkey, `[@${bibkey}]`));
    }
    lastEnd = start + m[0].length;
  }
  if (lastEnd < value.length) {
    out.push({ type: "text", value: value.slice(lastEnd) });
  }
  return out;
}

function parseBareAtLibraryCites(
  value: string,
  knownBibkeys?: ReadonlySet<string>,
): (TextNode | LinkNode)[] {
  const out: (TextNode | LinkNode)[] = [];
  let lastEnd = 0;
  for (const m of value.matchAll(BARE_AT_CITE_RE)) {
    const start = m.index!;
    const bibkey = m[1];
    if (!shouldLinkBareBibkey(bibkey, knownBibkeys)) continue;
    if (start > lastEnd) {
      out.push({ type: "text", value: value.slice(lastEnd, start) });
    }
    out.push(libraryLinkNode(bibkey, `@${bibkey}`));
    lastEnd = start + m[0].length;
  }
  if (out.length === 0) return [{ type: "text", value }];
  if (lastEnd < value.length) {
    out.push({ type: "text", value: value.slice(lastEnd) });
  }
  return out;
}

function parseLibraryCites(
  value: string,
  knownBibkeys?: ReadonlySet<string>,
): (TextNode | LinkNode)[] {
  const bracketed = parseBracketedLibraryCites(value);
  const hasBracketLinks = bracketed.length > 1 || bracketed[0]?.type === "link";
  if (hasBracketLinks) return bracketed;

  const bareAt = parseBareAtLibraryCites(value, knownBibkeys);
  const hasBareLinks = bareAt.length > 1 || bareAt[0]?.type === "link";
  if (hasBareLinks) return bareAt;

  return [{ type: "text", value }];
}

const SKIP_PARENT_TYPES = new Set([
  "link",
  "linkReference",
  "inlineCode",
  "code",
  "inlineMath",
  "math",
]);

export function remarkLibraryCiteRefs(
  options?: RemarkLibraryCiteRefsOptions,
) {
  const knownBibkeys = options?.knownBibkeys;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (root: any) => {
    const walk = (parent: ParentNode | null | undefined, parentType: string): void => {
      const children = parent?.children;
      if (!children) return;
      if (SKIP_PARENT_TYPES.has(parentType)) return;

      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.type === "inlineCode" && knownBibkeys?.size) {
          const code = (child as InlineCodeNode).value;
          if (shouldLinkBareBibkey(code, knownBibkeys)) {
            children.splice(i, 1, libraryLinkNode(code, `@${code}`));
            continue;
          }
        }
        if (child.type === "text") {
          const normalized = normalizeLibraryCiteMarkers((child as TextNode).value);
          const parts = parseLibraryCites(normalized, knownBibkeys);
          if (parts.length > 1 || parts[0]?.type === "link") {
            children.splice(i, 1, ...parts);
          } else if (normalized !== (child as TextNode).value) {
            (child as TextNode).value = normalized;
          }
        } else if ("children" in child) {
          walk(child as ParentNode, child.type);
        }
      }
    };
    walk(root as unknown as ParentNode, "root");
  };
}

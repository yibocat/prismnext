/**
 * Remark plugin: transforms bare `[n]` citation markers into markdown link nodes with a
 * `citation:n` URL scheme when `n` is in the session staged-citation list.
 *
 * Only runs when `stagedRefIds` is non-empty. Skips `[n](url)` (ordinary markdown links).
 */
type RemarkPlugin = (
  options?: RemarkCitationRefsOptions,
) => (root: unknown) => void;

export interface RemarkCitationRefsOptions {
  /** Ref ids staged for the active chat session — only these become citation links. */
  stagedRefIds?: ReadonlySet<number>;
}

const REF_RE = /\[(\d{1,3})\]/g;

interface TextNode {
  type: "text";
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
  children?: (TextNode | LinkNode | ParentNode)[];
}

function parseRefs(
  value: string,
  stagedRefIds: ReadonlySet<number>,
): (TextNode | LinkNode)[] {
  const out: (TextNode | LinkNode)[] = [];
  let lastEnd = 0;
  for (const m of value.matchAll(REF_RE)) {
    const start = m.index!;
    const n = Number.parseInt(m[1]!, 10);
    if (start > lastEnd) {
      out.push({ type: "text", value: value.slice(lastEnd, start) });
    }
    if (Number.isFinite(n) && n > 0 && stagedRefIds.has(n)) {
      out.push({
        type: "link",
        url: `citation:${n}`,
        title: null,
        children: [{ type: "text", value: `[${n}]` }],
      });
    } else {
      out.push({ type: "text", value: m[0] });
    }
    lastEnd = start + m[0].length;
  }
  if (lastEnd < value.length) {
    out.push({ type: "text", value: value.slice(lastEnd) });
  }
  return out;
}

const SKIP_PARENT_TYPES = new Set([
  "link",
  "linkReference",
  "inlineCode",
  "code",
  "inlineMath",
  "math",
]);

export const remarkCitationRefs: RemarkPlugin = (options) => {
  const stagedRefIds = options?.stagedRefIds;
  if (!stagedRefIds?.size) {
    return () => {};
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (root: any) => {
    const walk = (parent: ParentNode, parentType: string): void => {
      const children = parent.children;
      if (!children) return;
      if (SKIP_PARENT_TYPES.has(parentType)) return;

      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.type === "text") {
          const parts = parseRefs((child as TextNode).value, stagedRefIds);
          if (parts.length > 1 || parts[0]?.type === "link") {
            children.splice(i, 1, ...parts);
          }
        } else if ("children" in child) {
          walk(child as ParentNode, child.type);
        }
      }
    };
    walk(root as unknown as ParentNode, "root");
  };
};

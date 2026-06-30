/**
 * Remark plugin: transforms bare `[n]` citation markers into markdown link
 * nodes with a `citation:n` URL scheme, so the React renderer can intercept
 * them and render clickable citation refs that jump to the staged citation
 * panel.
 *
 * Only matches `[1]`–`[999]`. Skips text inside link/code/math nodes to avoid
 * clobbering real links or code. The React `a` override decides whether to
 * render an actual button (when the refId is staged for the active session)
 * or plain text `[n]` (when no match — e.g. ordinary brackets).
 */
type RemarkPlugin = (options?: unknown) => (root: unknown) => void;

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

function parseRefs(value: string): (TextNode | LinkNode)[] {
  const out: (TextNode | LinkNode)[] = [];
  let lastEnd = 0;
  for (const m of value.matchAll(REF_RE)) {
    const start = m.index!;
    if (start > lastEnd) {
      out.push({ type: "text", value: value.slice(lastEnd, start) });
    }
    const n = m[1];
    out.push({
      type: "link",
      url: `citation:${n}`,
      title: null,
      children: [{ type: "text", value: `[${n}]` }],
    });
    lastEnd = start + m[0].length;
  }
  if (lastEnd < value.length) {
    out.push({ type: "text", value: value.slice(lastEnd) });
  }
  return out;
}

// Node types whose text content must NOT be transformed.
const SKIP_PARENT_TYPES = new Set([
  "link",
  "linkReference",
  "inlineCode",
  "code",
  "inlineMath",
  "math",
]);

export const remarkCitationRefs: RemarkPlugin = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (root: any) => {
    const walk = (parent: ParentNode, parentType: string): void => {
      const children = parent.children;
      if (!children) return;
      if (SKIP_PARENT_TYPES.has(parentType)) return;

      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.type === "text") {
          const parts = parseRefs((child as TextNode).value);
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

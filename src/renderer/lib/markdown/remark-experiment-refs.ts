/**
 * Remark plugin: experiment island ids in plain text / inline code → experiment-ref links.
 */
import {
  encodeExperimentRefHref,
  looksLikeExperimentRef,
} from "./experiment-ref";

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

const EXPERIMENT_ID_RE = /\b(exp-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*)\b/gi;

function experimentLinkNode(id: string, label: string): LinkNode {
  return {
    type: "link",
    url: encodeExperimentRefHref(id),
    title: null,
    children: [{ type: "text", value: label }],
  };
}

function parseExperimentRefs(value: string): (TextNode | LinkNode)[] {
  const out: (TextNode | LinkNode)[] = [];
  let lastEnd = 0;
  for (const m of value.matchAll(EXPERIMENT_ID_RE)) {
    const start = m.index!;
    const id = m[1]!;
    if (start > lastEnd) {
      out.push({ type: "text", value: value.slice(lastEnd, start) });
    }
    out.push(experimentLinkNode(id, id));
    lastEnd = start + m[0].length;
  }
  if (out.length === 0) return [{ type: "text", value }];
  if (lastEnd < value.length) {
    out.push({ type: "text", value: value.slice(lastEnd) });
  }
  return out;
}

const SKIP_PARENT_TYPES = new Set([
  "link",
  "linkReference",
  "code",
  "inlineMath",
  "math",
]);

export function remarkExperimentRefs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (root: any) => {
    const walk = (parent: ParentNode | null | undefined, parentType: string): void => {
      const children = parent?.children;
      if (!children) return;
      if (SKIP_PARENT_TYPES.has(parentType)) return;

      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.type === "inlineCode") {
          const id = (child as InlineCodeNode).value;
          if (looksLikeExperimentRef(id)) {
            children.splice(i, 1, experimentLinkNode(id, id));
          }
          continue;
        }
        if (child.type === "text") {
          const parts = parseExperimentRefs((child as TextNode).value);
          if (parts.length > 1 || parts[0]?.type === "link") {
            children.splice(i, 1, ...parts);
          }
          continue;
        }
        if ("children" in child) {
          walk(child as ParentNode, child.type);
        }
      }
    };
    walk(root as unknown as ParentNode, "root");
  };
}

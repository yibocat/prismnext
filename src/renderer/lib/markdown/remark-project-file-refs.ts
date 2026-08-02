/**
 * Remark plugin: project-relative file paths in inline code → `project-file:` links
 * for ChatFileInline chips in AI replies.
 *
 * Only `` `path` `` — not `[label](path)` markdown links.
 *
 * Runs after remarkLibraryCiteRefs so known bibkeys stay literature chips.
 */
import {
  encodeProjectFileHref,
  looksLikeProjectFileRef,
} from "./project-file-ref";

export interface RemarkProjectFileRefsOptions {
  /** Scanned / lazy-registered project-relative paths (no extension required when listed). */
  knownProjectPaths?: ReadonlySet<string>;
}

interface InlineCodeNode {
  type: "inlineCode";
  value: string;
}

interface TextNode {
  type: "text";
  value: string;
}

interface LinkNode {
  type: "link";
  url: string;
  title: string | null;
  children: TextNode[];
}

interface ParentNode {
  type: string;
  children?: (TextNode | LinkNode | InlineCodeNode | ParentNode)[];
}

function projectFileLinkNode(path: string): LinkNode {
  return {
    type: "link",
    url: encodeProjectFileHref(path),
    title: null,
    children: [{ type: "text", value: path }],
  };
}

const SKIP_PARENT_TYPES = new Set([
  "link",
  "linkReference",
  "code",
  "inlineMath",
  "math",
]);

export function remarkProjectFileRefs(options?: RemarkProjectFileRefsOptions) {
  const knownProjectPaths = options?.knownProjectPaths;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (root: any) => {
    const walk = (parent: ParentNode | null | undefined, parentType: string): void => {
      const children = parent?.children;
      if (!children) return;
      if (SKIP_PARENT_TYPES.has(parentType)) return;

      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.type === "inlineCode") {
          const path = (child as InlineCodeNode).value;
          if (looksLikeProjectFileRef(path, knownProjectPaths)) {
            children.splice(i, 1, projectFileLinkNode(path));
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

/**
 * Remark plugin: transforms Obsidian-style [[wikilinks]] into standard
 * markdown links with a `wikilink:` URL scheme so the React renderer
 * can intercept them and navigate to the referenced file.
 *
 * Supported syntax:
 *   [[Page]]            → link to "Page", display "Page"
 *   [[Page|Alias]]      → link to "Page", display "Alias"
 *   [[Page#Heading]]    → link to "Page", display "Page > Heading"
 */
// Minimal Plugin type — avoids importing from unified (transitive dep).
type RemarkPlugin = (options?: unknown) => (root: unknown) => void;

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]/g;

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
  children: (TextNode | LinkNode | ParentNode)[];
}

/**
 * Parse a single wikilink match into a remark link node.
 * `hash` is the alias (#Heading) or pipe alias (|Alias).
 */
function makeWikilinkNode(target: string, hash?: string): LinkNode {
  const display = hash
    ? hash.startsWith("|")
      ? hash.slice(1)
      : `${target} > ${hash}`
    : target;

  return {
    type: "link",
    url: `wikilink:${target}${hash && hash.startsWith("#") ? hash : ""}`,
    title: null,
    children: [{ type: "text", value: display }],
  };
}

/**
 * Split a text string around [[wikilink]] patterns, returning a flat
 * array of text and link nodes.
 */
function parseWikilinks(value: string): (TextNode | LinkNode)[] {
  const out: (TextNode | LinkNode)[] = [];
  let lastEnd = 0;

  for (const m of value.matchAll(WIKILINK_RE)) {
    const start = m.index!;
    if (start > lastEnd) {
      out.push({ type: "text", value: value.slice(lastEnd, start) });
    }
    out.push(makeWikilinkNode(m[1].trim(), m[2]?.trim()));
    lastEnd = start + m[0].length;
  }

  if (lastEnd < value.length) {
    out.push({ type: "text", value: value.slice(lastEnd) });
  }

  return out;
}

export const remarkWikilinks: RemarkPlugin = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (root: any) => {
    const walk = (parent: ParentNode): void => {
      const children = parent.children;
      if (!children) return;

      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.type === "text") {
          const parts = parseWikilinks((child as TextNode).value);
          if (parts.length > 1 || parts[0]?.type === "link") {
            children.splice(i, 1, ...parts);
          }
        } else if ("children" in child) {
          walk(child as ParentNode);
        }
      }
    };

    walk(root as unknown as ParentNode);
  };
};

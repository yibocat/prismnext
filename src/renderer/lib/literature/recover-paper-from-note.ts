import { parseAuthorsInput } from "@/lib/literature/literature-format";
import type { ProjectFile } from "@/stores/document-store";
import { useDocumentStore } from "@/stores/document-store";
import type { LiteraturePaperPatch } from "@/stores/literature-store";
import {
  inferBibkeyFromNotePath,
  parseNoteFrontmatter,
} from "@/lib/literature/paper-notes";

function yamlQuote(value: string): string {
  if (/[:#{}[\],&*!|>'"%@`]|^\s|\s$/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** Build createPaper metadata from a reading note's frontmatter and path. */
export function paperPatchFromNote(
  content: string,
  relativePath: string,
  notebookDir: string,
): LiteraturePaperPatch {
  const fm = parseNoteFrontmatter(content);
  const folderKey = inferBibkeyFromNotePath(relativePath, notebookDir);
  const bibkey = fm?.bibkey?.trim() || folderKey || undefined;
  const title = fm?.title?.trim() || undefined;
  const doi = fm?.doi?.trim() || undefined;
  const arxiv_id = fm?.arxiv?.trim() || undefined;
  const authors = fm?.authors ? parseAuthorsInput(fm.authors) : null;

  return {
    bibkey,
    title: title || "Untitled",
    doi: doi ?? null,
    arxiv_id: arxiv_id ?? null,
    authors: authors ?? undefined,
  };
}

/** Update paper_id (and bibkey) in note frontmatter after restoring a library entry. */
export function patchNoteLinkFrontmatter(
  content: string,
  link: { paperId: string; bibkey?: string | null },
): string {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n?)/);
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;
  const existing = fmMatch ? (parseNoteFrontmatter(content) ?? {}) : {};
  const nextFm: Record<string, string> = { ...existing, paper_id: link.paperId };
  if (link.bibkey?.trim()) nextFm.bibkey = link.bibkey.trim();

  const lines = ["---"];
  for (const [key, value] of Object.entries(nextFm)) {
    lines.push(`${key}: ${yamlQuote(value)}`);
  }
  lines.push("---");
  const header = lines.join("\n");
  if (!body) return `${header}\n`;
  return body.startsWith("\n") ? `${header}${body}` : `${header}\n${body}`;
}

export async function loadNotebookNoteContents(
  projectRoot: string | null,
  files: ProjectFile[],
  notebookDir: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!projectRoot) return map;
  const doc = useDocumentStore.getState();
  const prefix = `${notebookDir}/`;

  for (const f of files) {
    if (!f.relativePath.startsWith(prefix) || !f.relativePath.endsWith(".md")) continue;
    let content = f.id ? doc.getAsset(f.id) : undefined;
    if (!content) {
      try {
        const { content: disk } = await window.electronAPI.fsRead(
          `${projectRoot}/${f.relativePath.replace(/^\//, "")}`,
        );
        content = disk;
      } catch {
        content = undefined;
      }
    }
    if (content) map.set(f.relativePath, content);
  }
  return map;
}

export async function persistNoteContent(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const doc = useDocumentStore.getState();
  const file = doc.files.find((f) => f.relativePath === relativePath);
  if (file) {
    doc.setContent(file.id, content);
    await doc.saveFile(file.id);
    return;
  }
  await window.electronAPI.fsWrite(
    `${projectRoot}/${relativePath.replace(/^\//, "")}`,
    content,
  );
  await doc.reloadMetadataFromDisk(true);
}

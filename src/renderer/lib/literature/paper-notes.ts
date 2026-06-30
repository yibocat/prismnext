import type { ProjectFile } from "@/stores/document-store";
import { findNotebookConfig, resolveNotebookDir, type WorkspaceFolder } from "@/types/workspace";
import type { LiteraturePaper } from "@/types/electron.d";

export interface PaperNoteFile {
  relativePath: string;
  name: string;
}

function sanitizeDirName(value: string): string {
  const cleaned = value.trim().replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
  return cleaned.replace(/^_|_$/g, "") || "paper";
}

function titleSlug(title: string, maxLen = 6): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return "untitled";
  const parts = slug.split("-").filter(Boolean);
  if (parts.length === 0) return slug.slice(0, maxLen);
  let out = parts[0]!;
  for (let i = 1; i < parts.length && out.length < maxLen; i++) {
    const next = `${out}-${parts[i]}`;
    if (next.length > maxLen) break;
    out = next;
  }
  return out.slice(0, maxLen);
}

/** Fallback folder name when a paper has no cite key yet. */
function paperNoteDirFallback(paper: LiteraturePaper): string {
  const year = paper.year != null ? String(paper.year) : "unknown";
  return `${year}-${titleSlug(paper.title)}`;
}

/** One folder per paper — same name as the cite key (bibkey). */
export function paperNoteDirName(paper: LiteraturePaper): string {
  const key = paper.bibkey?.trim();
  if (key) return sanitizeDirName(key);
  return paperNoteDirFallback(paper);
}

/** Folder names that may contain notes (cite-key folder + legacy year-slug layout). */
export function paperNoteDirCandidates(paper: LiteraturePaper): string[] {
  const dirs = new Set<string>();
  dirs.add(paperNoteDirName(paper));
  const legacySlug = paperNoteDirFallback(paper);
  if (legacySlug !== paperNoteDirName(paper)) dirs.add(legacySlug);
  return [...dirs];
}

/** Relative path to the paper's notes folder, e.g. `notes/vaswani2017attention`. */
export function paperNotesFolderPath(notebookDir: string, paper: LiteraturePaper): string {
  return `${notebookDir}/${paperNoteDirName(paper)}`;
}

/** Legacy Phase-1 flat note path before per-paper folders. */
export function legacyFlatPaperNotePath(notebookDir: string, paper: LiteraturePaper): string {
  const name = paper.bibkey?.trim()
    ? `${sanitizeDirName(paper.bibkey)}.md`
    : `${paper.year ?? "unknown"}-${titleSlug(paper.title)}.md`;
  return `${notebookDir}/${name}`;
}

/** Pick the next `{date}-note.md` filename inside a paper folder. */
export function nextPaperNoteFilename(existingNames: string[], date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const base = `${day}-note`;
  if (!existingNames.includes(`${base}.md`)) return `${base}.md`;
  let n = 2;
  while (existingNames.includes(`${base}-${n}.md`)) n++;
  return `${base}-${n}.md`;
}

/** Parse simple YAML frontmatter key/value pairs (single-line values). */
export function parseNoteFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const out: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function paperIdFromNoteContent(content: string): string | null {
  const fm = parseNoteFrontmatter(content);
  const id = fm?.paper_id?.trim();
  return id || null;
}

export function bibkeyFromNoteContent(content: string): string | null {
  const fm = parseNoteFrontmatter(content);
  const key = fm?.bibkey?.trim();
  return key || null;
}

/** Markdown body after YAML frontmatter (if any). */
export function noteBodyWithoutFrontmatter(content: string): string {
  const trimmed = content.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed.startsWith("---")) return content.trim();
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return content.trim();
  return trimmed.slice(end + 4).replace(/^\r?\n/, "").trim();
}

/** Whether Workspace settings explicitly define a notebook folder. */
export function hasNotebookConfigured(dirs: WorkspaceFolder[]): boolean {
  return findNotebookConfig(dirs) != null;
}

/** Resolve library paper from note frontmatter — paper_id first, bibkey fallback. */
export function resolvePaperForNote(
  content: string,
  papers: LiteraturePaper[],
): LiteraturePaper | null {
  const paperId = paperIdFromNoteContent(content);
  const bibkey = bibkeyFromNoteContent(content);
  if (paperId) {
    const byId = papers.find((p) => p.id === paperId);
    if (byId) return byId;
  }
  if (bibkey) {
    return papers.find((p) => p.bibkey === bibkey) ?? null;
  }
  return null;
}

function noteContentMatchesPaper(content: string, paper: LiteraturePaper): boolean {
  const paperId = paperIdFromNoteContent(content);
  const bibkey = bibkeyFromNoteContent(content);
  if (paper.id && paperId === paper.id) return true;
  if (paper.bibkey && bibkey === paper.bibkey) return true;
  return false;
}

function noteMatchesPaper(relativePath: string, paper: LiteraturePaper, notebookDir: string): boolean {
  for (const dirName of paperNoteDirCandidates(paper)) {
    const folder = `${notebookDir}/${dirName}`;
    if (relativePath.startsWith(`${folder}/`) && relativePath.endsWith(".md")) return true;
  }
  return relativePath === legacyFlatPaperNotePath(notebookDir, paper);
}

/** Zotero-synced papers that have on-disk reading notes (not yet imported to local). */
export function zoteroLinkedPapersWithNotes(
  papers: LiteraturePaper[],
  files: ProjectFile[],
  notebookDir: string,
  contentByPath?: Map<string, string>,
): Array<{ paper: LiteraturePaper; noteCount: number }> {
  return papers
    .filter((p) => Boolean(p.zotero_key))
    .map((paper) => ({
      paper,
      noteCount: listPaperNotes(paper, files, notebookDir, contentByPath).length,
    }))
    .filter((row) => row.noteCount > 0);
}

/** All markdown notes linked to a paper (path, legacy flat file, or frontmatter bibkey/paper_id). */
export function listPaperNotes(
  paper: LiteraturePaper,
  files: ProjectFile[],
  notebookDir: string,
  contentByPath?: Map<string, string>,
): PaperNoteFile[] {
  const seen = new Set<string>();
  const notes: PaperNoteFile[] = [];

  for (const f of files) {
    if (!f.relativePath.endsWith(".md")) continue;
    if (!noteMatchesPaper(f.relativePath, paper, notebookDir)) continue;
    if (seen.has(f.relativePath)) continue;
    seen.add(f.relativePath);
    notes.push({ relativePath: f.relativePath, name: f.name });
  }

  if (contentByPath) {
    const notebookPrefix = `${notebookDir}/`;
    for (const f of files) {
      if (!f.relativePath.startsWith(notebookPrefix) || !f.relativePath.endsWith(".md")) continue;
      if (seen.has(f.relativePath)) continue;
      const content = contentByPath.get(f.relativePath);
      if (!content || !noteContentMatchesPaper(content, paper)) continue;
      seen.add(f.relativePath);
      notes.push({ relativePath: f.relativePath, name: f.name });
    }
  }

  return notes.sort((a, b) => b.name.localeCompare(a.name));
}

/** Pick note to open: persisted path when still valid, else first note, else null. */
export function resolvePaperNotePath(
  activeNotePath: string | null | undefined,
  notes: PaperNoteFile[],
): string | null {
  if (notes.length === 0) return null;
  if (activeNotePath && notes.some((n) => n.relativePath === activeNotePath)) {
    return activeNotePath;
  }
  return notes[0]!.relativePath;
}

/** Bibkey inferred from note path: `notes/{bibkey}/…` or legacy `notes/{bibkey}.md`. */
export function inferBibkeyFromNotePath(relativePath: string, notebookDir: string): string | null {
  const prefix = `${notebookDir}/`;
  if (!relativePath.startsWith(prefix)) return null;
  const rest = relativePath.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash > 0) return rest.slice(0, slash);
  if (rest.endsWith(".md")) return rest.slice(0, -3);
  return null;
}

export interface OrphanPaperNote extends PaperNoteFile {
  bibkey: string | null;
  title: string | null;
  stalePaperId: string | null;
  content: string;
}

/** True when frontmatter explicitly links the note to the literature library. */
export function isLiteratureLinkedNoteContent(content: string): boolean {
  const fm = parseNoteFrontmatter(content);
  return Boolean(fm?.paper_id?.trim() || fm?.bibkey?.trim());
}

/**
 * Reading notes whose library entry is missing (e.g. after Zotero disconnect).
 * Only notes with literature frontmatter (`paper_id` / `bibkey`) — not general notebook md.
 */
export function listOrphanPaperNotes(
  papers: LiteraturePaper[],
  files: ProjectFile[],
  notebookDir: string,
  contentByPath: Map<string, string>,
): OrphanPaperNote[] {
  const orphans: OrphanPaperNote[] = [];
  const seen = new Set<string>();
  const notebookPrefix = `${notebookDir}/`;

  for (const f of files) {
    if (!f.relativePath.startsWith(notebookPrefix) || !f.relativePath.endsWith(".md")) continue;
    const content = contentByPath.get(f.relativePath);
    if (!content) continue;
    if (!isLiteratureLinkedNoteContent(content)) continue;
    if (resolvePaperForNote(content, papers)) continue;

    const fm = parseNoteFrontmatter(content);
    const folderKey = inferBibkeyFromNotePath(f.relativePath, notebookDir);

    if (seen.has(f.relativePath)) continue;
    seen.add(f.relativePath);
    orphans.push({
      relativePath: f.relativePath,
      name: f.name,
      bibkey: fm?.bibkey?.trim() ?? folderKey,
      title: fm?.title?.trim() ?? null,
      stalePaperId: fm?.paper_id?.trim() ?? null,
      content,
    });
  }

  return orphans.sort((a, b) => b.relativePath.localeCompare(a.relativePath));
}

export function listPaperNotePaths(
  paper: LiteraturePaper,
  files: ProjectFile[],
  workspaceDirs: WorkspaceFolder[],
): string[] {
  const notebookDir = resolveNotebookDir(workspaceDirs);
  return listPaperNotes(paper, files, notebookDir).map((n) => n.relativePath);
}

/** Find notes whose frontmatter paper_id matches (scan all md under notebook). */
export function listNotesByPaperId(
  paperId: string,
  files: ProjectFile[],
  openedContents: Map<string, { content?: string }>,
  notebookDir: string,
): PaperNoteFile[] {
  const prefix = `${notebookDir}/`;
  const matches: PaperNoteFile[] = [];
  for (const f of files) {
    if (!f.relativePath.startsWith(prefix) || !f.relativePath.endsWith(".md")) continue;
    const entry = openedContents.get(f.relativePath);
    const content = entry?.content;
    if (!content) continue;
    if (paperIdFromNoteContent(content) === paperId) {
      matches.push({ relativePath: f.relativePath, name: f.name });
    }
  }
  return matches;
}

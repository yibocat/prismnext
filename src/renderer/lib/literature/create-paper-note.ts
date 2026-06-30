import { toast } from "sonner";
import { ensureRightAreaVisibleForFiles } from "@/lib/files/open-project-file";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import { formatLiteratureAuthors } from "@/modes/literature-mode/literature-format";
import {
  hasNotebookConfigured,
  listPaperNotes,
  nextPaperNoteFilename,
  paperNotesFolderPath,
} from "@/lib/literature/paper-notes";
import type { LiteraturePaper } from "@/types/electron.d";

function yamlQuote(value: string): string {
  if (/[:#{}[\],&*!|>'"%@`]|^\s|\s$/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** Markdown body for a new reading note. */
export function buildPaperNoteTemplate(paper: LiteraturePaper): string {
  const today = new Date().toISOString().slice(0, 10);
  const authors = formatLiteratureAuthors(paper.authors);
  const lines: string[] = ["---"];

  lines.push(`paper_id: ${yamlQuote(paper.id)}`);
  if (paper.bibkey?.trim()) lines.push(`bibkey: ${yamlQuote(paper.bibkey.trim())}`);
  lines.push(`title: ${yamlQuote(paper.title)}`);
  if (authors !== "Unknown authors") {
    lines.push(`authors: ${yamlQuote(authors)}`);
  }
  if (paper.doi?.trim()) lines.push(`doi: ${yamlQuote(paper.doi.trim())}`);
  if (paper.arxiv_id?.trim()) lines.push(`arxiv: ${yamlQuote(paper.arxiv_id.trim())}`);
  lines.push(`created: ${today}`);
  lines.push(
    "---",
    "",
    `# ${paper.title}`,
    "",
    "> Linked literature entry — open from Literature mode or use **Open in Literature** in the toolbar.",
    "",
    "## Summary",
    "",
    "## Key insights",
    "",
    "## Questions / Critique",
    "",
    "## Quotes",
    "",
  );

  return lines.join("\n");
}

export async function openPaperNote(relativePath: string, name: string): Promise<void> {
  await openPaperNoteInFiles(relativePath, name);
}

/** Open a reading note as a pinned Files markdown tab (full Files workspace). */
export async function openPaperNoteInFiles(relativePath: string, name: string): Promise<void> {
  ensureRightAreaVisibleForFiles();
  navigateFileTreeToPath(relativePath);
  const doc = useDocumentStore.getState();
  if (!doc.openedContents.has(relativePath)) {
    await doc.openFile(relativePath);
  } else {
    doc.setActiveFile(relativePath);
  }
  useRightPanelStore.getState().openFile(relativePath, relativePath, name, { pin: true });
}

/**
 * Create a new reading note in the paper's notes folder (always a new file).
 * Returns the note relative path, or null on failure.
 */
export async function createNewPaperNote(
  paper: LiteraturePaper,
  options?: { activateFilesMode?: boolean },
): Promise<string | null> {
  const activateFilesMode = options?.activateFilesMode ?? false;
  const doc = useDocumentStore.getState();
  const checkoutRoot = doc.checkoutRoot;
  if (!checkoutRoot) {
    toast.error("Open a project first");
    return null;
  }

  const notebookDir = resolveNotebookDir(useWorkspaceConfigStore.getState().workspaceDirs);
  const workspaceDirs = useWorkspaceConfigStore.getState().workspaceDirs;
  if (!hasNotebookConfigured(workspaceDirs)) {
    toast.info(
      "Notes will be saved under notes/ (default). Configure a Notebook folder in Settings → Workspace.",
      { id: "literature-notebook-fallback" },
    );
  }
  const paperDir = paperNotesFolderPath(notebookDir, paper);

  if (!doc.folders.includes(notebookDir)) {
    try {
      await doc.createFolder(notebookDir);
    } catch {
      return null;
    }
  }

  if (!doc.folders.includes(paperDir)) {
    try {
      await doc.createFolder(paperDir);
    } catch {
      return null;
    }
  }

  const existingNotes = listPaperNotes(paper, doc.files, notebookDir);
  const namesInFolder = existingNotes
    .filter((n) => n.relativePath.startsWith(`${paperDir}/`))
    .map((n) => n.name);
  const filename = nextPaperNoteFilename(namesInFolder);
  const relativePath = `${paperDir}/${filename}`;

  const content = buildPaperNoteTemplate(paper);
  try {
    await window.electronAPI.fsCreate(checkoutRoot, relativePath, content);
    await doc.reloadMetadataFromDisk(true);
    if (activateFilesMode) {
      await openPaperNote(relativePath, filename);
    }
    toast.success("Note created");
    return relativePath;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to create note");
    return null;
  }
}

/** @deprecated Use createNewPaperNote — kept for callers that expect open-or-create. */
export async function createOrOpenPaperNote(paper: LiteraturePaper): Promise<string | null> {
  return createNewPaperNote(paper);
}

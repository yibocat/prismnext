import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import { listPaperNotes } from "@/lib/literature/paper-notes";
import { createNewPaperNote } from "@/lib/literature/create-paper-note";
import type { LiteraturePaper } from "@/types/electron.d";

/** Markdown blockquote + page citation for a PDF excerpt. */
export function formatPaperQuoteMarkdown(
  quotedText: string,
  page: number,
  bibkey: string,
): string {
  const trimmed = quotedText.trim();
  if (!trimmed) return "";
  const blockquote = trimmed
    .split(/\r?\n/)
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return `${blockquote}\n\n— p.${page} (@${bibkey})\n`;
}

/** Insert a quote block under `## Quotes` when present, otherwise append at EOF. */
export function insertQuoteIntoNoteContent(noteContent: string, quoteBlock: string): string {
  const quote = quoteBlock.trim();
  if (!quote) return noteContent;

  const marker = "## Quotes";
  const idx = noteContent.indexOf(marker);
  if (idx < 0) {
    const base = noteContent.trimEnd();
    return base.length === 0 ? `${quote}\n` : `${base}\n\n${quote}\n`;
  }

  let afterHeader = noteContent.indexOf("\n", idx + marker.length);
  if (afterHeader < 0) afterHeader = noteContent.length;
  else afterHeader += 1;

  const tail = noteContent.slice(afterHeader);
  const nextHeading = tail.search(/^## /m);
  const sectionEnd = nextHeading >= 0 ? afterHeader + nextHeading : noteContent.length;

  const before = noteContent.slice(0, sectionEnd).trimEnd();
  const after = noteContent.slice(sectionEnd);
  const suffix = after.startsWith("\n") || after.length === 0 ? after : `\n${after}`;
  return `${before}\n\n${quote}\n${suffix}`;
}

async function resolveNotePathForPaper(paper: LiteraturePaper): Promise<string | null> {
  const reader = useLiteratureReaderStore.getState();
  const stored = reader.activeNotePathByPaper[paper.id];
  if (stored) return stored;

  const doc = useDocumentStore.getState();
  const notebookDir = resolveNotebookDir(useWorkspaceConfigStore.getState().workspaceDirs);
  const notes = listPaperNotes(paper, doc.files, notebookDir);
  if (notes.length > 0) return notes[notes.length - 1]!.relativePath;

  return createNewPaperNote(paper, { activateFilesMode: false });
}

/** Open notes pane and append a PDF quote to the active (or new) reading note. */
export async function insertPaperQuoteIntoNote(
  paper: LiteraturePaper,
  quotedText: string,
  page: number,
): Promise<boolean> {
  const text = quotedText.trim();
  if (!text) {
    toast.info("Select text in the PDF first");
    return false;
  }

  const bibkey = paper.bibkey?.trim() || paper.id;
  const quoteBlock = formatPaperQuoteMarkdown(text, page, bibkey);
  if (!quoteBlock) return false;

  const notePath = await resolveNotePathForPaper(paper);
  if (!notePath) return false;

  const reader = useLiteratureReaderStore.getState();
  reader.setNotesPaneOpen(paper.id, true);
  reader.setActiveNote(paper.id, notePath);

  const litTab = useRightPanelStore
    .getState()
    .tabs.find((t) => t.kind === "literature" && t.literaturePaperId === paper.id);
  if (litTab?.viewMode === "preview") {
    useRightPanelStore.getState().setTabViewMode(litTab.id, "source");
  }

  const doc = useDocumentStore.getState();
  if (!doc.openedContents.has(notePath)) {
    await doc.openFile(notePath);
  } else {
    doc.setActiveFile(notePath);
  }

  const current = doc.getContent(notePath);
  doc.setContent(notePath, insertQuoteIntoNoteContent(current, quoteBlock));

  toast.success("Quote inserted into note");
  return true;
}

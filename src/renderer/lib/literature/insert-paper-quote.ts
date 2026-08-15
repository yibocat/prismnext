import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import { listPaperNotes } from "@/lib/literature/paper-notes";
import {
  buildPaperNoteTemplate,
  createNewPaperNote,
} from "@/lib/literature/create-paper-note";
import type { LiteraturePaper } from "@/types/electron.d";
import { rewritePaperExtractImageSrcs } from "@shared/paper-extract-images";

export { rewritePaperExtractImageSrcs } from "@shared/paper-extract-images";

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

async function resolveNotePathForPaper(
  paper: LiteraturePaper,
  quoteBlock: string,
): Promise<{ notePath: string; content: string } | null> {
  const reader = useLiteratureReaderStore.getState();
  const stored = reader.activeNotePathByPaper[paper.id];
  const doc = useDocumentStore.getState();
  const notebookDir = resolveNotebookDir(useWorkspaceConfigStore.getState().workspaceDirs);
  const notes = listPaperNotes(paper, doc.files, notebookDir);

  if (stored) {
    const content = doc.openedContents.has(stored)
      ? doc.getAsset(stored)
      : (await window.electronAPI.fsRead(
          doc.fileMetadata.get(stored)?.absolutePath ?? "",
        ).catch(() => ({ content: "" }))).content;
    return {
      notePath: stored,
      content: insertQuoteIntoNoteContent(content, quoteBlock),
    };
  }

  if (notes.length > 0) {
    const notePath = notes[notes.length - 1]!.relativePath;
    const meta = doc.fileMetadata.get(notePath);
    const content = doc.openedContents.has(notePath)
      ? doc.getAsset(notePath)
      : meta
        ? (await window.electronAPI.fsRead(meta.absolutePath).catch(() => ({ content: "" }))).content
        : "";
    return {
      notePath,
      content: insertQuoteIntoNoteContent(content, quoteBlock),
    };
  }

  const template = buildPaperNoteTemplate(paper);
  const content = insertQuoteIntoNoteContent(template, quoteBlock);
  const notePath = await createNewPaperNote(paper, {
    activateFilesMode: false,
    initialContent: content,
    silent: true,
  });
  if (!notePath) return null;
  return { notePath, content };
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
  const withImagePaths = rewritePaperExtractImageSrcs(text, paper.id);
  const quoteBlock = formatPaperQuoteMarkdown(withImagePaths, page, bibkey);
  if (!quoteBlock) return false;

  const resolved = await resolveNotePathForPaper(paper, quoteBlock);
  if (!resolved) return false;

  const { notePath, content } = resolved;
  const doc = useDocumentStore.getState();

  // Persist before opening UI so NotesPane cannot race and overwrite with template-only disk.
  const meta = doc.fileMetadata.get(notePath);
  if (meta) {
    await window.electronAPI.fsWrite(meta.absolutePath, content);
  }

  const reader = useLiteratureReaderStore.getState();
  reader.setNotesPaneOpen(paper.id, true);
  reader.setActiveNote(paper.id, notePath);

  const litTab = useRightPanelStore
    .getState()
    .tabs.find((t) => t.kind === "literature" && t.literaturePaperId === paper.id);
  if (litTab?.viewMode === "preview") {
    useRightPanelStore.getState().setTabViewMode(litTab.id, "source");
  }

  doc.seedOpenedFile(notePath, content);

  toast.success("Quote inserted into note");
  return true;
}

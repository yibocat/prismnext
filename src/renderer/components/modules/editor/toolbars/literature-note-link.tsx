import { BookOpenIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Hint } from "@/components/ui/hint";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  bibkeyFromNoteContent,
  paperIdFromNoteContent,
  resolvePaperForNote,
} from "@/lib/literature/paper-notes";
import { MARKDOWN_TOOLBAR_BTN } from "./markdown-toolbar";

/** Toolbar control — jump from a linked reading note to its literature entry. */
export function LiteratureNoteLinkButton({ filePath }: { filePath: string }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const content = useDocumentStore((s) => s.openedContents.get(filePath)?.content ?? "");
  const papers = useLiteratureStore((s) => s.papers);
  const recoverPaperFromNote = useLiteratureStore((s) => s.recoverPaperFromNote);
  const [recovering, setRecovering] = useState(false);

  const paperId = paperIdFromNoteContent(content);
  const bibkey = bibkeyFromNoteContent(content);
  const paper = resolvePaperForNote(content, papers);
  const hasLinkMeta = Boolean(paperId || bibkey);

  if (!hasLinkMeta) return null;

  const handleRestore = async () => {
    if (!projectRoot || !content.trim()) {
      toast.error("Open a project and save the note first");
      return;
    }
    setRecovering(true);
    try {
      await recoverPaperFromNote(projectRoot, filePath, content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRecovering(false);
    }
  };

  if (!paper) {
    return (
      <Hint label="Restore library entry from this note">
        <button
          type="button"
          className={MARKDOWN_TOOLBAR_BTN}
          disabled={recovering || !projectRoot}
          onClick={() => void handleRestore()}
        >
          {recovering ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <BookOpenIcon className="size-3.5 opacity-70" />
          )}
        </button>
      </Hint>
    );
  }

  const handleOpen = () => {
    useRightPanelStore.getState().openLiteraturePaper(paper.id, paper.title, "reader");
  };

  return (
    <Hint label={`Open in Literature: ${paper.title}`}>
      <button
        type="button"
        className={MARKDOWN_TOOLBAR_BTN}
        onClick={handleOpen}
      >
        <BookOpenIcon className="size-3.5" />
      </button>
    </Hint>
  );
}

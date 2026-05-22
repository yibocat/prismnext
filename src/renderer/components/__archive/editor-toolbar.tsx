import {
  BoldIcon,
  ItalicIcon,
  ListIcon,
  Heading1Icon,
  Heading2Icon,
  CodeIcon,
  FunctionSquareIcon,
  BookMarkedIcon,
  FileTextIcon,
} from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useDocumentStore } from "@/stores/document-store";

export function EditorToolbar() {
  // Subscribe only to the file name, not the entire files array
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const files = useDocumentStore((s) => s.files);
  const fileName = files.find((f) => f.id === activeFileId)?.name ?? "main.tex";

  const insertText = (before: string, after = "") => {
    const view = (window as any).__cmEditorView;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: {
        from,
        to,
        insert: before + selectedText + after,
      },
      selection: {
        anchor: from + before.length,
        head: from + before.length + selectedText.length,
      },
    });
    view.focus();
  };

  const wrapSelection = (wrapper: string) => {
    insertText(wrapper, wrapper);
  };

  return (
    <div className="drag-region flex h-[var(--height-editor-toolbar)] items-center gap-1 border-border border-b bg-muted/30 px-2">
      <FileTextIcon className="size-4 text-muted-foreground" />
      <span className="mr-2 font-medium text-muted-foreground text-[length:var(--font-toolbar-label)]">
        {fileName}
      </span>
      {/* Spacer for drag region */}
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <TooltipIconButton
          tooltip="Bold (\\textbf)"
          onClick={() => insertText("\\textbf{", "}")}
        >
          <BoldIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Italic (\\textit)"
          onClick={() => insertText("\\textit{", "}")}
        >
          <ItalicIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Code (\\texttt)"
          onClick={() => insertText("\\texttt{", "}")}
        >
          <CodeIcon className="size-4" />
        </TooltipIconButton>
        <div className="mx-2 h-4 w-px bg-border" />
        <TooltipIconButton
          tooltip="Section"
          onClick={() => insertText("\\section{", "}")}
        >
          <Heading1Icon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Subsection"
          onClick={() => insertText("\\subsection{", "}")}
        >
          <Heading2Icon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="List item"
          onClick={() => insertText("\\item ")}
        >
          <ListIcon className="size-4" />
        </TooltipIconButton>
        <div className="mx-2 h-4 w-px bg-border" />
        <TooltipIconButton
          tooltip="Inline math ($...$)"
          onClick={() => wrapSelection("$")}
        >
          <FunctionSquareIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Display math (\\[...\\])"
          onClick={() => insertText("\\[\n  ", "\n\\]")}
        >
          <span className="font-mono text-[length:var(--font-toolbar-label)]">{"∫"}</span>
        </TooltipIconButton>
        <div className="mx-2 h-4 w-px bg-border" />
        <TooltipIconButton
          tooltip="Citation (\\cite)"
          onClick={() => insertText("\\cite{", "}")}
        >
          <BookMarkedIcon className="size-4" />
        </TooltipIconButton>
      </div>
    </div>
  );
}

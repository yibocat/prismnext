import { MarkdownToolbar } from "./markdown-toolbar";
import { LanguageLabel } from "./language-label";

interface FileToolbarProps {
  filePath?: string;
}

/**
 * Dispatches toolbar content based on file extension.
 * Follows the project pattern: mode-level dispatch (right-area.tsx)
 * → file-type dispatch (this component).
 */
export function FileToolbar({ filePath }: FileToolbarProps) {
  const ext = filePath?.slice(filePath.lastIndexOf(".")).toLowerCase() ?? "";

  switch (ext) {
    case ".md":
    case ".mdx":
      return <MarkdownToolbar />;

    case ".tex":
    case ".ltx":
      // Plain .tex editor in file mode — no toolbar
      return null;

    default:
      // Known language → label; unknown → nothing
      return <LanguageLabel ext={ext} />;
  }
}

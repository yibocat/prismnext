import { useDocumentStore } from "@/stores/document-store";
import { useTranslation } from "react-i18next";
import { openUrlInBrowser } from "@/lib/browser-link";
import { GlobeIcon } from "lucide-react";
import { MarkdownToolbar } from "@/components/modules/editor/toolbars/markdown-toolbar";
import { LanguageLabel } from "@/components/modules/editor/toolbars/language-label";
import { Hint } from "@/components/ui/hint";

interface FileToolbarProps {
  filePath?: string;
}

function HtmlPreviewButton({ filePath }: { filePath: string }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const handlePreview = () => {
    if (!projectRoot) return;
    const absPath = `${projectRoot}/${filePath}`;
    const fileUrl = `file://${encodeURI(absPath)}`;
    openUrlInBrowser(fileUrl);
  };

  return (
    <Hint label={t("modes.files.previewInBrowser")}>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        onClick={handlePreview}
      >
        <GlobeIcon className="size-3.5" />
      </button>
    </Hint>
  );
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

    case ".html":
    case ".htm":
      return filePath ? <HtmlPreviewButton filePath={filePath} /> : null;

    case ".tex":
    case ".ltx":
      // Plain .tex editor in file mode — no toolbar
      return null;

    default:
      // Known language → label; unknown → nothing
      return <LanguageLabel ext={ext} />;
  }
}

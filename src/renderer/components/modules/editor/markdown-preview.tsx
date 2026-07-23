import { memo, useCallback, useMemo } from "react";
import type { Components } from "react-markdown";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTabContext } from "@/lib/workspace/tab-context";
import { MarkdownDocumentPreview } from "@/components/modules/shared/markdown-document-preview";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";
import {
  MARKDOWN_COMPONENTS,
  markdownPreviewProfileForPath,
} from "@/lib/markdown/markdown-config";
import { ExtractMarkdownImage } from "@/lib/markdown/extract-markdown-images";

const CONTAIN_STYLE: React.CSSProperties = {
  contain: "layout style paint",
  transform: "translateZ(0)",
};

function Wikilink({ target, children }: { target: string; children: React.ReactNode }) {
  const handleClick = useCallback(() => {
    const store = useRightPanelStore.getState();
    const docStore = useDocumentStore.getState();
    const targetLower = target.toLowerCase();
    const file = docStore.files.find(
      (f) =>
        f.name.toLowerCase() === targetLower ||
        f.name.toLowerCase().startsWith(targetLower) ||
        f.relativePath.toLowerCase().includes(targetLower),
    );
    if (file) store.openFile(file.id, file.relativePath, file.name);
  }, [target]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer"
      title={`Open "${target}"`}
    >
      {children}
    </button>
  );
}

const WIKILINK_COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  a: ({ href, children }: React.ComponentProps<"a">) => {
    if (href?.startsWith("wikilink:")) {
      const target = href.slice("wikilink:".length).split("#")[0];
      return <Wikilink target={target}>{children}</Wikilink>;
    }
    return (
      <AppBrowserLink href={href} className="text-primary underline">
        {children}
      </AppBrowserLink>
    );
  },
};

export const MarkdownPreview = memo(function MarkdownPreview() {
  const { tab } = useTabContext();
  const fileId = tab.fileId;
  const entry = useDocumentStore((s) =>
    fileId ? s.openedContents.get(fileId) : undefined,
  );
  const content = entry?.content ?? "";
  const filePath = tab.filePath ?? fileId ?? "";
  const previewProfile = markdownPreviewProfileForPath(filePath);

  const markdownComponents = useMemo(() => {
    return {
      ...WIKILINK_COMPONENTS,
      img: ({ src, alt }: React.ComponentProps<"img">) => {
        if (src && /^(https?:|data:|blob:)/i.test(src.trim())) {
          return (
            <img
              src={src}
              alt={alt ?? ""}
              className="my-2 max-w-full h-auto rounded border border-border/40"
              loading="lazy"
            />
          );
        }
        return <ExtractMarkdownImage src={src} alt={alt} mdFilePath={filePath} />;
      },
    } satisfies Components;
  }, [filePath]);

  if (!entry) {
    return (
      <div className="h-full overflow-auto px-6 py-4" style={CONTAIN_STYLE}>
        <div className="space-y-3 animate-pulse">
          <div className="h-5 w-2/3 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <MarkdownDocumentPreview
      content={content}
      previewProfile={previewProfile}
      emptyMessage="Empty file"
      markdownComponents={markdownComponents}
    />
  );
});

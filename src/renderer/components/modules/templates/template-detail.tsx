import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeftIcon, FileTextIcon } from "lucide-react";
import { Root, Pages, Page, CanvasLayer, TextLayer } from "@anaralabs/lector";
import "pdfjs-dist/web/pdf_viewer.css";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { TemplateFull } from "./types";

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ─── File tree ───

interface FileTreeNode {
  name: string;
  isDir: boolean;
  children: FileTreeNode[];
  content?: string;
}

function buildFileTree(paths: { path: string; content: string }[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const { path, content } of paths) {
    const parts = path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i];
      let node = current.find((n) => n.name === name);
      if (!node) {
        node = { name, isDir: !isLast, children: [], content: isLast ? content : undefined };
        current.push(node);
      }
      if (!isLast) current = node.children;
    }
  }
  return root;
}

function FileTree({ nodes, depth = 0 }: { nodes: FileTreeNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.name}>
          <div
            className="flex items-center gap-1.5 py-1 text-[length:var(--font-size-12)] text-muted-foreground"
            style={{ paddingLeft: `${depth * 16}px` }}
          >
            <FileTextIcon className="size-3 shrink-0 opacity-50" />
            <span className="font-mono">{node.name}{node.isDir ? "/" : ""}</span>
          </div>
          {node.children.length > 0 && (
            <FileTree nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  );
}

// ─── Detail ───

export function DetailView({
  template,
  onBack,
  onUse,
  canApply = true,
  applyDisabledReason,
}: {
  template: TemplateFull;
  onBack: () => void;
  onUse: (t: TemplateFull) => void;
  canApply?: boolean;
  applyDisabledReason?: string;
}) {
  const [showSource, setShowSource] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const fileTree = useMemo(() => buildFileTree(template.files), [template]);
  const mainTexContent = useMemo(
    () => template.files.find((f) => f.path === "main.tex")?.content ?? "",
    [template.files],
  );

  useEffect(() => {
    window.electronAPI.templatePreview(template.id).then(setPreviewUrl);
    window.electronAPI.templateGetPdfData(template.id).then(setPdfDataUrl);
  }, [template.id]);

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      <button
        type="button"
        className="flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors mb-6"
        onClick={onBack}
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to templates
      </button>

      {/* Left content + Right preview */}
      <div className="flex flex-col sm:flex-row gap-8">
        {/* Left side: info + files + actions */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-[length:var(--font-size-13)] font-medium mb-2">Description</h3>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-relaxed">
              {template.description}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline">{template.documentClass}</Badge>
              {template.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </div>

          {/* File structure */}
          <Accordion type="single" defaultValue="files" collapsible>
            <AccordionItem value="files" className="border rounded-lg px-3">
              <AccordionTrigger className="text-[length:var(--font-size-13)] font-medium hover:no-underline">
                Files &amp; Structure
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <FileTree nodes={fileTree} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={() => onUse(template)}
              size="sm"
              className="shadow-none"
              disabled={!canApply}
              title={applyDisabledReason}
            >
              Use
            </Button>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setShowSource(true)}>
              View Source
            </Button>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setShowPdfDialog(true)}>
              View PDF
            </Button>
          </div>

          {/* View Source Dialog */}
          <Dialog open={showSource} onOpenChange={setShowSource}>
            <DialogContent className="!max-w-4xl max-h-[85vh]">
              <DialogHeader>
                <DialogTitle>main.tex</DialogTitle>
              </DialogHeader>
              <div className="overflow-auto max-h-[60vh]">
                <pre className="text-[length:var(--font-size-12)] font-mono text-muted-foreground whitespace-pre-wrap break-words">
                  {mainTexContent}
                </pre>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Right side: Preview image */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[length:var(--font-size-13)] font-medium mb-2">Preview</h3>
          <div className="aspect-[3/4] rounded-lg border border-border overflow-hidden bg-muted/20 flex items-center justify-center">
            {previewUrl ? (
              <img src={previewUrl} alt={`${template.name} preview`} className="w-full h-full object-contain" />
            ) : (
              <span className="text-[length:var(--font-hint)] text-muted-foreground/50">No preview</span>
            )}
          </div>
        </div>

        {/* View PDF Dialog — live lector viewer */}
        <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
          <DialogContent className="!max-w-6xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{template.name} — Preview</DialogTitle>
            </DialogHeader>
            {pdfDataUrl && (
              <div className="flex-1 min-h-0">
                <Root source={pdfDataUrl} className="h-full flex flex-col" isZoomFitWidth
                  loader={<span className="flex justify-center pt-20 text-muted-foreground">Loading...</span>}>
                  <Pages className="flex-1 overflow-auto" gap={8}>
                    <Page className="bg-white shadow-md">
                      <CanvasLayer />
                      <TextLayer />
                    </Page>
                  </Pages>
                </Root>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

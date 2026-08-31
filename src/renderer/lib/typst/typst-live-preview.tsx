import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { paperKeyFromMainFile } from "@/lib/compile/compile-artifact";
import {
  ensureTypstLive,
  getTypstLivePages,
  useTypstLiveStore,
} from "@/stores/typst-live-store";
import { useDocumentStore } from "@/stores/document-store";

const LIVE_SHELL = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#525659;}
  #pages{padding:16px 0;}
  .page{margin:0 auto 16px;background:#fff;width:fit-content;max-width:100%;box-shadow:0 1px 4px rgba(0,0,0,.25);}
  svg{display:block;max-width:100%;height:auto;}
</style></head><body><div id="pages"></div></body></html>`;

function paintPages(doc: Document, pages: string[], prev: string[]): void {
  const root = doc.getElementById("pages");
  if (!root) return;
  const children = root.children;
  for (let i = 0; i < pages.length; i++) {
    let el = children[i] as HTMLElement | undefined;
    if (!el) {
      el = doc.createElement("div");
      el.className = "page";
      root.appendChild(el);
    }
    if (prev[i] !== pages[i]) {
      el.innerHTML = pages[i] ?? "";
    }
  }
  while (root.children.length > pages.length) {
    root.removeChild(root.lastChild as ChildNode);
  }
}

export function TypstLivePreview({
  compileRootRel,
  enabled,
}: {
  compileRootRel: string;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const paintedRef = useRef<string[]>([]);
  const readyRef = useRef(false);
  const pagesRef = useRef<string[]>([]);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const revision = useTypstLiveStore((s) => s.revision);
  const artifactKey = projectRoot ? paperKeyFromMainFile(projectRoot, compileRootRel) : null;
  const pages = artifactKey ? getTypstLivePages(artifactKey) : undefined;
  pagesRef.current = pages ?? [];

  useEffect(() => {
    if (!enabled || !projectRoot) return;
    ensureTypstLive(compileRootRel);
  }, [enabled, projectRoot, compileRootRel]);

  const apply = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !readyRef.current) return;
    const next = pagesRef.current;
    paintPages(doc, next, paintedRef.current);
    paintedRef.current = next;
  };

  useLayoutEffect(() => {
    void revision;
    apply();
  }, [pages, revision]);

  if (!enabled) return null;

  const empty = !pages?.length;
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#525659]">
      <iframe
        ref={iframeRef}
        title={t("modes.files.typstLivePreview")}
        className="h-full w-full border-0 bg-[#525659]"
        sandbox="allow-same-origin"
        srcDoc={LIVE_SHELL}
        onLoad={() => {
          readyRef.current = true;
          paintedRef.current = [];
          apply();
        }}
      />
      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[length:var(--font-size-12)] text-muted-foreground">
          {t("modes.files.typstPreviewStarting")}
        </div>
      ) : null}
    </div>
  );
}

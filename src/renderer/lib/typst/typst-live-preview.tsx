import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { compileArtifactCacheKey } from "@shared/compile/artifact-key";
import { paperKeyFromMainFile, getTypstLivePages, useCompileStore } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";

export function TypstLivePreview({
  compileRootRel,
  enabled,
}: {
  compileRootRel: string;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const typstLiveRevision = useCompileStore((s) => s.typstLiveRevision);
  const compilingKey = useCompileStore((s) => s.compilingKey);
  const artifactKey = projectRoot ? paperKeyFromMainFile(projectRoot, compileRootRel) : null;
  const pages = artifactKey ? getTypstLivePages(artifactKey) : undefined;
  const compiling = Boolean(
    artifactKey && compilingKey === compileArtifactCacheKey(artifactKey),
  );

  useEffect(() => {
    if (!enabled || !projectRoot) return;
    useCompileStore.getState().ensureTypstLiveCompile(compileRootRel);
  }, [enabled, projectRoot, compileRootRel]);

  const srcDoc = useMemo(() => {
    void typstLiveRevision;
    const body = (pages ?? [])
      .map((svg) => `<div class="page">${svg}</div>`)
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#525659;}
      .page{margin:16px auto;background:#fff;width:fit-content;max-width:100%;box-shadow:0 1px 4px rgba(0,0,0,.25);}
      svg{display:block;max-width:100%;height:auto;}
    </style></head><body>${body}</body></html>`;
  }, [pages, typstLiveRevision]);

  if (!enabled) return null;

  const empty = !pages?.length;
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-muted">
      {empty ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-[length:var(--font-size-12)] text-muted-foreground">
          {t("modes.files.typstPreviewStarting")}
        </div>
      ) : (
        <iframe
          title={t("modes.files.typstLivePreview")}
          className="h-full w-full border-0 bg-[#525659]"
          sandbox=""
          srcDoc={srcDoc}
        />
      )}
      {compiling && !empty ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" />
      ) : null}
    </div>
  );
}

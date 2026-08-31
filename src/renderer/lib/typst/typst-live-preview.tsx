import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { paperKeyFromMainFile } from "@/lib/compile/compile-artifact";
import { compileArtifactCacheKey } from "@shared/compile/artifact-key";
import {
  ensureTypstPreview,
  useTypstSessionStore,
} from "@/stores/typst-session-store";
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
  const artifactKey = projectRoot ? paperKeyFromMainFile(projectRoot, compileRootRel) : null;
  const cacheKey = artifactKey ? compileArtifactCacheKey(artifactKey) : "";
  const previewUrl = useTypstSessionStore((s) => (cacheKey ? s.previewUrlByKey[cacheKey] : undefined));
  const previewError = useTypstSessionStore((s) => (cacheKey ? s.errorByKey[cacheKey] : undefined));

  useEffect(() => {
    if (!enabled || !projectRoot) return;
    ensureTypstPreview(compileRootRel);
  }, [enabled, projectRoot, compileRootRel]);

  if (!enabled) return null;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#525659]">
      {previewUrl ? (
        <iframe
          title={t("modes.files.typstLivePreview")}
          className="h-full w-full border-0 bg-[#525659]"
          src={previewUrl}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[length:var(--font-size-12)] text-muted-foreground">
          {previewError
            ? t("modes.files.typstPreviewFailed", { error: previewError })
            : t("modes.files.typstPreviewStarting")}
        </div>
      )}
    </div>
  );
}

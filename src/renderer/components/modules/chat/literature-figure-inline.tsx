import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChatArtifactBlock } from "@/lib/markdown/chat-artifact-block";
import {
  decodeLibraryFigureHref,
  resolveLibraryFigurePath,
} from "@shared/paper-extract-images";
import { useLiteratureStore } from "@/stores/literature-store";
import { artifactBasename } from "@shared/artifact-path";

export { decodeLibraryFigureHref };

/** Literature figure — same shell as chat markdown `![alt](path)` images. */
export const LiteratureFigureInline = memo(function LiteratureFigureInline({
  bibkey,
  imageRel,
  caption,
}: {
  bibkey: string;
  imageRel: string;
  caption?: string;
}) {
  const { t } = useTranslation();
  const paper = useLiteratureStore((s) =>
    s.papers.find((p) => p.bibkey === bibkey) ?? null,
  );
  const imagePath = useMemo(() => {
    if (!paper) return null;
    return resolveLibraryFigurePath(paper.id, imageRel);
  }, [paper, imageRel]);
  const label =
    caption?.trim() ||
    artifactBasename(imageRel) ||
    t("modes.literature.figureFromPaper", { defaultValue: "Figure" });

  if (!imagePath) {
    return (
      <span className="my-2 block text-[length:var(--font-size-12)] text-muted-foreground">
        [{label} — {bibkey}]
      </span>
    );
  }

  return <ChatArtifactBlock path={imagePath} title={label} kind="image" />;
});

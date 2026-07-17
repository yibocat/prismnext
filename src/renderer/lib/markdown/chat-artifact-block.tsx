/**
 * ChatArtifactBlock — shared shell for AI-reply project result files.
 * Image kind reuses ChatProjectImage (no double plate).
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon, FileIcon, FolderOpenIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { openArtifactPathInFiles } from "@/modes/experiments-mode/experiments-artifact-nav";
import { artifactBasename } from "../../../shared/artifact-path";
import { ChatProjectImage } from "./extract-markdown-images";
import { ChatArtifactPdf } from "./chat-artifact-pdf";
import {
  classifyArtifactKind,
  normalizeArtifactDisplayPath,
  parseArtifactFenceContent,
  resolveToolCardGalleryPaths,
  type ChatArtifactKind,
} from "./chat-artifact";

export function ChatArtifactBlock({
  path,
  title,
  kind: kindProp,
}: {
  path: string;
  title?: string;
  kind?: ChatArtifactKind;
}) {
  const { t } = useTranslation();
  const rel = normalizeArtifactDisplayPath(path);
  const kind = kindProp ?? classifyArtifactKind(rel);
  const label = (title || artifactBasename(rel) || rel).trim();
  const [copied, setCopied] = useState(false);

  const open = useCallback(() => {
    void openArtifactPathInFiles(rel);
  }, [rel]);

  const copyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rel);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [rel]);

  if (kind === "image") {
    return <ChatProjectImage src={rel} alt={label} />;
  }

  if (kind === "pdf") {
    return <ChatArtifactPdf path={rel} title={title} />;
  }

  return (
    <div className="my-2 flex w-full max-w-full items-stretch gap-2 rounded-lg border border-border/50 bg-muted/20 p-1.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground">
        <FileIcon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="truncate text-[length:var(--font-chat-message)] font-medium text-foreground">
          {label}
        </div>
        <div className="truncate font-mono text-[length:var(--font-size-11)] text-muted-foreground">
          {rel}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 self-center pr-0.5">
        <Hint label={t("chat.artifact.openInFiles", { defaultValue: "Open in Files" })}>
          <button
            type="button"
            onClick={open}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("chat.artifact.openInFiles", { defaultValue: "Open in Files" })}
          >
            <FolderOpenIcon className="size-3.5" aria-hidden />
          </button>
        </Hint>
        <Hint
          label={
            copied
              ? t("chat.artifact.copied", { defaultValue: "Copied" })
              : t("chat.artifact.copyPath", { defaultValue: "Copy path" })
          }
        >
          <button
            type="button"
            onClick={() => void copyPath()}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("chat.artifact.copyPath", { defaultValue: "Copy path" })}
          >
            <CopyIcon className="size-3.5" aria-hidden />
          </button>
        </Hint>
      </div>
    </div>
  );
}

/** Parse fence body and render; invalid body → unavailable note. */
export function ChatArtifactFence({ raw }: { raw: string }) {
  const { t } = useTranslation();
  const parsed = parseArtifactFenceContent(raw);
  if (!parsed) {
    return (
      <span className="my-2 block text-[length:var(--font-size-12)] text-muted-foreground">
        {t("chat.artifact.unavailable", { defaultValue: "Artifact unavailable" })}
      </span>
    );
  }
  return <ChatArtifactBlock path={parsed.path} title={parsed.title} />;
}

/**
 * Tool-card gallery: same ChatArtifactBlock shell as reply fences.
 * `suppressPaths` hides files already shown (or about to be shown) in the reply.
 */
export function ChatArtifactGallery({
  paths,
  suppressPaths = [],
}: {
  paths: string[];
  suppressPaths?: readonly string[];
}) {
  const { t } = useTranslation();
  const { paths: visible, overflow } = resolveToolCardGalleryPaths(
    paths,
    suppressPaths,
  );
  if (!visible.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {visible.map((rel) => (
        <ChatArtifactBlock key={rel} path={rel} />
      ))}
      {overflow > 0 ? (
        <p className="px-0.5 text-[length:var(--font-size-11)] text-muted-foreground">
          {t("chat.artifact.galleryOverflow", {
            count: overflow,
            defaultValue: "+{{count}} more — open in Experiments",
          })}
        </p>
      ) : null}
    </div>
  );
}

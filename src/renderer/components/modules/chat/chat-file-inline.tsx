import { memo, useMemo, type ReactNode } from "react";
import { Icon } from "@iconify/react/offline";
import { getFileIconName } from "@/lib/files/file-icon-class";
import { projectPathBasename } from "@/lib/files/mentionable-files";
import { openComposerFileToken } from "@/lib/chat/inline-token-open";
import { useDocumentStore } from "@/stores/document-store";
import { InlineTokenChip } from "./inline-tokens/inline-token-chip";
import { cn } from "@/lib/utils";

function inlineFileIcon(path: string) {
  const name = path.split(/[/\\]/).pop() || path;
  return (
    <Icon
      icon={getFileIconName(name)}
      className="size-[0.85em] shrink-0"
    />
  );
}

/** Resolve wikilink target to a project-relative path when possible. */
export function resolveChatFilePath(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return trimmed;
  const docStore = useDocumentStore.getState();
  const targetLower = trimmed.toLowerCase();
  const file = docStore.files.find(
    (f) =>
      f.name.toLowerCase() === targetLower
      || f.name.toLowerCase().startsWith(targetLower)
      || f.relativePath.toLowerCase().endsWith(targetLower)
      || f.relativePath.toLowerCase().includes(targetLower),
  );
  return file?.relativePath ?? trimmed;
}

export const ChatFileInline = memo(function ChatFileInline({
  path,
  label,
  title,
  className,
}: {
  path: string;
  label?: ReactNode;
  title?: string;
  className?: string;
}) {
  const resolvedPath = useMemo(() => resolveChatFilePath(path), [path]);
  const normalizedLabel = typeof label === "string" ? label.trim() : "";
  const useCustomLabel =
    normalizedLabel.length > 0
    && normalizedLabel !== path.trim()
    && normalizedLabel !== resolvedPath;
  const display = useCustomLabel
    ? normalizedLabel
    : projectPathBasename(resolvedPath);

  return (
    <InlineTokenChip
      variant="file"
      label={display}
      title={title ?? resolvedPath}
      icon={inlineFileIcon(resolvedPath)}
      className={cn(className)}
      onClick={() => openComposerFileToken(resolvedPath)}
    />
  );
});

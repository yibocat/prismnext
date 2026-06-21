import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FileDiffIcon } from "lucide-react";
import { ToolCard, DiffLines, param } from "./shared";
import { useToolPermission } from "./use-tool-permission";
import { useSettingsStore } from "@/stores/settings-store";
import { resolvePermissionMode } from "@shared/permission-modes";

export const PatchWidget = memo(function PatchWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;
  const { isAwaitingPermission, isToolDenied } = useToolPermission(
    toolUse.id || "",
    toolName,
  );
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const showPermissionAsk =
    isAwaitingPermission && resolvePermissionMode(permissionMode) === "ask";
  const isDenied = isToolDenied;
  const isLoading = !toolResult && !showPermissionAsk && !isDenied;

  const patchContent = param(toolUse.input, "patch") || param(toolUse.input, "content") || "";
  const filePath = param(toolUse.input, "file_path", "filePath") || param(toolUse.input, "path") || "";

  const fileCount = patchContent
    ? (patchContent.match(/^diff --git|^--- |^\+\+\+ /gm) || []).length / 3 || 1
    : 0;

  const fileName = filePath.split("/").pop() || (fileCount > 1 ? `${Math.ceil(fileCount)} files` : "patch");
  const showBody = !!patchContent || hasContent || showPermissionAsk;

  return (
    <ToolCard
      toolName={toolName}
      icon={<FileDiffIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{fileName}</span>}
      meta={
        <>
          {showPermissionAsk && (
            <span className="text-primary shrink-0 text-[length:var(--font-chat-meta)]">
              Awaiting permission
            </span>
          )}
          {fileCount > 1 && (
            <span className="text-muted-foreground/70 shrink-0 text-[length:var(--font-chat-meta)]">
              {Math.ceil(fileCount)} files
            </span>
          )}
          <span className="text-muted-foreground/60 shrink-0">
            {showPermissionAsk
              ? "Permission required"
              : isDenied
                ? "Denied"
              : isLoading
                ? "Applying…"
                : isError
                  ? "Failed"
                  : "Applied"}
          </span>
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError || isDenied}
      hasContent={showBody}
      bodyClassName="font-mono max-h-80 overflow-y-auto whitespace-pre-wrap break-all"
    >
      {patchContent ? (
        <DiffLines oldStr="" newStr={patchContent} />
      ) : hasContent ? (
        <span className="text-muted-foreground">
          {typeof toolResult?.content === "string"
            ? toolResult.content.slice(0, 3000)
            : JSON.stringify(toolResult?.content ?? "", null, 2).slice(0, 3000)}
        </span>
      ) : null}
    </ToolCard>
  );
});

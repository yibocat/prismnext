import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { PuzzleIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

export const SkillWidget = memo(function SkillWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const skillName = param(toolUse.input, "name") || "";
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  const outputText = typeof toolResult?.content === "string"
    ? toolResult.content
    : JSON.stringify(toolResult?.content ?? "", null, 2);

  return (
    <ToolCard
      toolName={toolName}
      icon={<PuzzleIcon className="size-3.5 text-primary" />}
      label={<span className="font-medium truncate">{skillName || "Skill"}</span>}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono whitespace-pre-wrap text-muted-foreground max-h-80 overflow-y-auto"
    >
      {outputText.length > 3000
        ? outputText.slice(0, 3000) + `\n\n··· ${outputText.length - 3000} more chars`
        : outputText}
    </ToolCard>
  );
});

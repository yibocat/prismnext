import { memo, useState } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { ScrollTextIcon } from "lucide-react";
import { ToolCard, Field } from "./shared";

function parseToolJson(content: unknown): Record<string, unknown> | null {
  if (content == null) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      try {
        const inner = JSON.parse(parsed) as unknown;
        if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
          return inner as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function unwrapPayload(content: unknown): Record<string, unknown> | null {
  const outer = parseToolJson(content);
  if (!outer) return null;
  if (typeof outer.output === "string") {
    return parseToolJson(outer.output) ?? outer;
  }
  return outer;
}

function RuleSummary({ data }: { data: Record<string, unknown> }) {
  if (data.ok === false) {
    return (
      <p className="text-[length:var(--font-chat-meta)] text-destructive">
        {typeof data.error === "string" ? data.error : "Rule write failed"}
      </p>
    );
  }

  return (
    <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
      <Field label="rule" value={String(data.name ?? "—")} />
      <Field label="mode" value={String(data.mode ?? "—")} />
      <Field label="path" value={String(data.path ?? "—")} />
    </div>
  );
}

export const ProjectRuleToolWidget = memo(function ProjectRuleToolWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const resultContent = toolResult?.content ?? toolUse.content;
  const data = unwrapPayload(resultContent);
  const isLoading = !toolResult;
  const isError = data?.ok === false;

  return (
    <ToolCard
      toolName={toolName}
      icon={<ScrollTextIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">Project rule</span>}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={isError}
      hasContent={!!data}
    >
      {() => (data ? <RuleSummary data={data} /> : null)}
    </ToolCard>
  );
});

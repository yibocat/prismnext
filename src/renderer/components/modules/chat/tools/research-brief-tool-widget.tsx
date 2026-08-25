import { memo, useState } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FileTextIcon } from "lucide-react";
import { RESEARCH_BRIEF_REL } from "@shared/research/brief";
import { ToolCard, Field } from "./shared";
import { ChatFileLink } from "../chat-file-link";

const LABELS: Record<string, string> = {
  "research-brief-read": "Research brief",
  "research-brief-update": "Update brief",
};

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

function BriefSummary({
  toolName,
  data,
}: {
  toolName: string;
  data: Record<string, unknown>;
}) {
  if (data.error && typeof data.error === "string") {
    return <p className="text-[length:var(--font-chat-meta)] text-destructive">{data.error}</p>;
  }

  if (toolName === "research-brief-read") {
    const sections = data.sections;
    const count =
      sections && typeof sections === "object" && !Array.isArray(sections)
        ? Object.keys(sections as Record<string, unknown>).filter((k) => {
            const v = (sections as Record<string, unknown>)[k];
            return typeof v === "string" && v.trim().length > 0;
          }).length
        : 0;
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
        <Field label="path" value={<ChatFileLink path={String(data.path ?? RESEARCH_BRIEF_REL)} />} />
        <Field label="sections filled" value={String(count)} />
      </div>
    );
  }

  if (toolName === "research-brief-update") {
    if (data.ok === false) {
      return (
        <p className="text-[length:var(--font-chat-meta)] text-destructive">
          {typeof data.error === "string" ? data.error : "Update failed"}
        </p>
      );
    }
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
        <Field label="section" value={String(data.section ?? "")} />
        <Field label="path" value={<ChatFileLink path={RESEARCH_BRIEF_REL} />} />
        {data.append === true ? <Field label="mode" value="append" /> : <Field label="mode" value="replace" />}
      </div>
    );
  }

  return null;
}

export const ResearchBriefToolWidget = memo(function ResearchBriefToolWidget({
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
  const isError = !!data?.error;

  return (
    <ToolCard
      toolName={toolName}
      icon={<FileTextIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{LABELS[toolName] ?? toolName}</span>}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={isError}
      hasContent={!!data}
    >
      {() => (data ? <BriefSummary toolName={toolName} data={data} /> : null)}
    </ToolCard>
  );
});

import { memo, type ComponentType } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import {
  isComposerHostedToolId,
  selectComposerHostedQuestionId,
  selectComposerHostedTodoId,
} from "@/lib/chat/composer-pending-tools";
import { useChatStore } from "@/stores/chat-store";
import { EditWidget } from "./edit-widget";
import { BashWidget } from "./bash-widget";
import { TodoWriteWidget } from "./todo-widget";
import { PlanWidget } from "./plan-widget";
import { AskUserQuestionWidget } from "./ask-question-widget";
import { ReadWidget } from "./read-widget";
import { GrepWidget } from "./grep-widget";
import { GlobWidget } from "./glob-widget";
import { ListWidget } from "./list-widget";
import { WebFetchWidget } from "./webfetch-widget";
import { WebSearchWidget } from "./websearch-widget";
import { SkillWidget } from "./skill-widget";
import { PatchWidget } from "./patch-widget";
import { DeleteWidget } from "./delete-widget";
import { MoveWidget } from "./move-widget";
import { LiteratureToolWidget } from "./literature-tool-widget";
import { LatexToolWidget } from "./latex-tool-widget";
import { ResearchBriefToolWidget } from "./research-brief-tool-widget";
import { ProjectRuleToolWidget } from "./project-rule-tool-widget";
import { ExperimentToolWidget } from "./experiment-tool-widget";
import { InteractionToolWidget } from "./interaction-tool-widget";
import { LspWidget } from "./lsp-widget";
import { GenericWidget } from "./generic-widget";

export type ToolWidgetComponent = ComponentType<{
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
  /** Paths already shown (or about to be shown) in the assistant reply body. */
  suppressArtifactPaths?: readonly string[];
  /** Inside ActivityFold expanded panel — hide heavy inline peeks. */
  nestedInActivity?: boolean;
  hostedInComposer?: boolean;
  surface?: "inline" | "composer" | "drawer";
}>;

let registeredTaskWidget: ToolWidgetComponent | null = null;

/** Called from task-widget-register after TaskWidget module loads. */
export function registerTaskWidget(widget: ToolWidgetComponent): void {
  registeredTaskWidget = widget;
}

function resolveTaskWidget(): ToolWidgetComponent {
  return registeredTaskWidget ?? GenericWidget;
}

const BUILTIN_TOOL_WIDGETS: Record<string, ToolWidgetComponent> = {
  edit: EditWidget,
  write: EditWidget,
  read: ReadWidget,
  apply_patch: PatchWidget,
  grep: GrepWidget,
  glob: GlobWidget,
  bash: BashWidget,
  webfetch: WebFetchWidget,
  websearch: WebSearchWidget,
  skill: SkillWidget,
  todowrite: TodoWriteWidget,
  plan: PlanWidget,
};

const CUSTOM_TOOL_WIDGETS: Record<string, ToolWidgetComponent> = {
  question: AskUserQuestionWidget,
  delete: DeleteWidget,
  move: MoveWidget,
  "literature-search": LiteratureToolWidget,
  "literature-discover": LiteratureToolWidget,
  "literature-stage": LiteratureToolWidget,
  "literature-add": LiteratureToolWidget,
  "literature-read": LiteratureToolWidget,
  "literature-read-pdf": LiteratureToolWidget,
  "literature-intensive-reading": LiteratureToolWidget,
  "literature-export-bib": LiteratureToolWidget,
  "literature-delete": LiteratureToolWidget,
  "citation-health": LiteratureToolWidget,
  "latex-root": LatexToolWidget,
  "latex-compile": LatexToolWidget,
  "research-brief-read": ResearchBriefToolWidget,
  "research-brief-update": ResearchBriefToolWidget,
  "project-rule-write": ProjectRuleToolWidget,
  "experiment-log": ExperimentToolWidget,
  "experiment-run": ExperimentToolWidget,
  "results-snapshot": ExperimentToolWidget,
  "interaction-list": InteractionToolWidget,
  "interaction-read": InteractionToolWidget,
  "interaction-write": InteractionToolWidget,
  "interaction-open": InteractionToolWidget,
};

function parseToolResultContent(content: unknown): Record<string, unknown> | null {
  if (!content) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isLiteratureSearchResult(content: unknown): boolean {
  const payload = parseToolResultContent(content);
  if (!payload) return false;
  const data =
    typeof payload.output === "string"
      ? parseToolResultContent(payload.output) ?? payload
      : payload;
  const results = data.results;
  if (!Array.isArray(results) || results.length === 0) return false;
  const first = results[0];
  return !!(
    first
    && typeof first === "object"
    && !Array.isArray(first)
    && typeof (first as Record<string, unknown>).bibkey === "string"
  );
}

function isLiteratureDiscoverResult(content: unknown): boolean {
  const payload = parseToolResultContent(content);
  if (!payload) return false;
  const data =
    typeof payload.output === "string"
      ? parseToolResultContent(payload.output) ?? payload
      : payload;
  if (Array.isArray(data.sourcesQueried) && Array.isArray(data.hits)) return true;
  const hits = data.hits;
  if (!Array.isArray(hits) || hits.length === 0) return false;
  const first = hits[0];
  return !!(
    first
    && typeof first === "object"
    && !Array.isArray(first)
    && typeof (first as Record<string, unknown>).source === "string"
  );
}

function resolveToolWidgetName(
  toolUse: ContentBlock,
  toolResult?: ContentBlock,
): string {
  const name = (toolUse.name || "").toLowerCase();
  if (CUSTOM_TOOL_WIDGETS[name]) return name;
  if (isLiteratureDiscoverResult(toolResult?.content)) return "literature-discover";
  if (isLiteratureSearchResult(toolResult?.content)) return "literature-search";
  return name;
}

export const ToolWidget = memo(function ToolWidget({
  toolUse,
  toolResult,
  suppressArtifactPaths,
  nestedInActivity,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  suppressArtifactPaths?: readonly string[];
  nestedInActivity?: boolean;
}) {
  const hostedQuestionId = useChatStore(selectComposerHostedQuestionId);
  const hostedTodoId = useChatStore(selectComposerHostedTodoId);
  const hostedInComposer = isComposerHostedToolId(
    toolUse.id,
    hostedQuestionId,
    hostedTodoId,
  );

  const name = resolveToolWidgetName(toolUse, toolResult);
  const displayName = name === (toolUse.name || "").toLowerCase()
    ? (toolUse.name || "")
    : name;

  let Widget: ToolWidgetComponent | null = CUSTOM_TOOL_WIDGETS[name] || null;

  if (!Widget) {
    if (name === "task") {
      Widget = resolveTaskWidget();
    } else {
      Widget = BUILTIN_TOOL_WIDGETS[name] || null;
    }
  }

  if (!Widget && name.startsWith("lsp")) {
    Widget = LspWidget;
  }

  if (!Widget) {
    Widget = GenericWidget;
  }

  return (
    <Widget
      toolUse={toolUse}
      toolResult={toolResult}
      toolName={displayName}
      suppressArtifactPaths={suppressArtifactPaths}
      nestedInActivity={nestedInActivity}
      hostedInComposer={hostedInComposer}
      surface="inline"
    />
  );
});

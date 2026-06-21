import { memo, type ComponentType } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { EditWidget } from "./edit-widget";
import { BashWidget } from "./bash-widget";
import { TodoWriteWidget } from "./todo-widget";
import { ThinkingWidget } from "./thinking-widget";
import { AskUserQuestionWidget } from "./ask-question-widget";
import { ReadWidget } from "./read-widget";
import { GrepWidget } from "./grep-widget";
import { GlobWidget } from "./glob-widget";
import { ListWidget } from "./list-widget";
import { WebFetchWidget } from "./webfetch-widget";
import { WebSearchWidget } from "./websearch-widget";
import { TaskWidget } from "./task-widget";
import { SkillWidget } from "./skill-widget";
import { PatchWidget } from "./patch-widget";
import { LspWidget } from "./lsp-widget";
import { GenericWidget } from "./generic-widget";

export { ThinkingWidget } from "./thinking-widget";
export { EditWidget } from "./edit-widget";
export { BashWidget } from "./bash-widget";
export { TodoWriteWidget } from "./todo-widget";
export { AskUserQuestionWidget } from "./ask-question-widget";
export { ReadWidget } from "./read-widget";
export { GrepWidget } from "./grep-widget";
export { GlobWidget } from "./glob-widget";
export { ListWidget } from "./list-widget";
export { WebFetchWidget } from "./webfetch-widget";
export { WebSearchWidget } from "./websearch-widget";
export { TaskWidget } from "./task-widget";
export { SkillWidget } from "./skill-widget";
export { PatchWidget } from "./patch-widget";
export { LspWidget } from "./lsp-widget";
export { GenericWidget } from "./generic-widget";
export { getToolMeta, usesProposedChange, shouldTrackProposedChange, isFileWriteTool, isPatchTool, isDiskMutationTool, extractPatchTargetPaths } from "./tool-meta";
export type { ToolMeta, PermissionConfirmUx, PermissionGroup } from "./tool-meta";
export { ChangeReviewBar } from "./change-review-bar";
export { useToolPermission } from "./use-tool-permission";

// ─── Tool Widget type ──────────────────────────────────────────────

type ToolWidgetComponent = ComponentType<{
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}>;

// ─── Built-in OpenCode tool Widgets ─────────────────────────────────
// These map OpenCode's standard tool names to their prism‑next Widget
// components. Each built-in tool has a dedicated Widget with tailored UX.
// See OpenCode docs: https://opencode.ai/docs/tools/

const BUILTIN_TOOL_WIDGETS: Record<string, ToolWidgetComponent> = {
  // File I/O
  edit: EditWidget,
  write: EditWidget, // write and edit share EditWidget (diff + accept/reject)
  read: ReadWidget,
  apply_patch: PatchWidget,
  patch: PatchWidget, // both "apply_patch" and "patch" are used by OpenCode

  // Search
  grep: GrepWidget,
  glob: GlobWidget,
  list: ListWidget,
  // lsp_* is handled by a prefix match below

  // Execution
  bash: BashWidget,

  // Network
  webfetch: WebFetchWidget,
  websearch: WebSearchWidget,

  // Workflow / Interaction
  task: TaskWidget,
  skill: SkillWidget,
  todowrite: TodoWriteWidget,

  // Plan (rendered from plan.updated ACP event → ContentBlock)
  plan: TodoWriteWidget,
};

/**
 * # prism‑next Custom Tool Widget Registry
 *
 * When you create a new prism‑next built-in tool (see `src/main/tools/`
 * for the tool definition), add its Widget here so the renderer knows
 * how to display it.
 *
 * ## How to add a Widget for a new custom tool
 *
 * 1. Create `src/renderer/components/modules/chat/tools/<name>-widget.tsx`
 *    following the existing Widget pattern (StatusIcon + collapsible +
 *    toolUse.input for params, toolResult for output).
 *
 * 2. Import and register it here:
 *
 *    ```typescript
 *    import { MyToolWidget } from "./my-tool-widget";
 *
 *    const CUSTOM_TOOL_WIDGETS: Record<string, ToolWidgetComponent> = {
 *      // ...
 *      "prism-compile": CompileWidget,
 *      "prism-zotero-import": ZoteroImportWidget,
 *    };
 *    ```
 *
 * The key MUST match the tool file name (minus `.ts`) from `src/main/tools/`.
 *
 * OpenCode sees the tool name = file name. The ToolWidget dispatcher below
 * checks `CUSTOM_TOOL_WIDGETS` FIRST, so a custom tool with the same name
 * as a built-in tool will take precedence (matching OpenCode's own override
 * behaviour).
 *
 * @see src/main/tools/index.ts — tool registration on the main-process side
 */
const CUSTOM_TOOL_WIDGETS: Record<string, ToolWidgetComponent> = {
  // prism‑next built-in custom tools
  "question": AskUserQuestionWidget,
};

// ─── ToolWidget Dispatcher ──────────────────────────────────────────

export const ToolWidget = memo(function ToolWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const name = (toolUse.name || "").toLowerCase();
  const displayName = toolUse.name || "";

  // Resolve widget component
  let Widget: ToolWidgetComponent | null = null;

  // 1. Check custom tool Widgets first — allows overriding built-in Widgets
  Widget = CUSTOM_TOOL_WIDGETS[name] || null;

  // 2. Check built-in OpenCode tool Widgets
  if (!Widget) {
    Widget = BUILTIN_TOOL_WIDGETS[name] || null;
  }

  // 3. Prefix-based routing for tool families
  if (!Widget && name.startsWith("lsp")) {
    Widget = LspWidget;
  }

  // 4. Fallback — unhandled tool, render with minimal generic UI
  if (!Widget) {
    Widget = GenericWidget;
  }

  return <Widget toolUse={toolUse} toolResult={toolResult} toolName={displayName} />;
});

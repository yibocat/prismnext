import { memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { EditWidget } from "./edit-widget";
import { BashWidget } from "./bash-widget";
import { TodoWriteWidget } from "./todo-widget";
import { ThinkingWidget } from "./thinking-widget";
import { AskUserQuestionWidget } from "./ask-question-widget";
import { GenericWidget } from "./generic-widget";

export { ThinkingWidget } from "./thinking-widget";
export { EditWidget } from "./edit-widget";
export { BashWidget } from "./bash-widget";
export { TodoWriteWidget } from "./todo-widget";
export { AskUserQuestionWidget } from "./ask-question-widget";
export { GenericWidget } from "./generic-widget";

export const ToolWidget = memo(function ToolWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const name = toolUse.name?.toLowerCase() || "";

  if (name.startsWith("edit") || name.startsWith("multiedit") || name.startsWith("write")) {
    return <EditWidget toolUse={toolUse} toolResult={toolResult} />;
  }
  if (name === "bash") {
    return <BashWidget toolUse={toolUse} toolResult={toolResult} />;
  }
  if (name === "todowrite") {
    return <TodoWriteWidget toolUse={toolUse} />;
  }
  if (name === "askuserquestion") {
    return <AskUserQuestionWidget toolUse={toolUse} toolResult={toolResult} />;
  }
  return <GenericWidget toolUse={toolUse} toolResult={toolResult} />;
});

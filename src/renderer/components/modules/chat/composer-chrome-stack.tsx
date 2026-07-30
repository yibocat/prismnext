import { useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chat-store";
import { useExperimentStore } from "@/stores/experiment-store";
import {
  resolveComposerPendingQuestion,
  resolveComposerPendingTodo,
  selectComposerHostedQuestionId,
  selectComposerHostedTodoId,
} from "@/lib/chat/composer-pending-tools";
import {
  resolveComposerPendingExperimentRun,
  selectComposerHostedExperimentRunId,
} from "@/lib/chat/composer-pending-experiment";
import {
  PermissionGatePanel,
  usePermissionGateState,
} from "./permission-gate-panel";
import { PlanSuggestBar } from "./plan-suggest-bar";
import { PlanChrome } from "./plan-chrome";
import { QuestionComposerPanel } from "./question-composer-panel";
import { TodoPlanBar } from "./todo-plan-bar";
import { ExperimentRunBar } from "./experiment-run-bar";
import {
  ComposerChromeStackBody,
  type ComposerChromeStackItem,
} from "./composer-chrome-stack-body";
function useComposerChromeStackItems(): ComposerChromeStackItem[] {
  const { t } = useTranslation();
  const streamTick = useChatStore((s) => s.streamTick);

  const planSuggestVisible = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return !!tab?.planSuggestVisible && tab.sessionAgent === "build";
  });
  const planChromeVisible = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionAgent === "plan" && !!tab.planDraftFileReady && !tab.planConfirmSuppressed;
  });
  const questionId = useChatStore(selectComposerHostedQuestionId);
  const todoId = useChatStore(selectComposerHostedTodoId);
  const experimentRunId = useChatStore(selectComposerHostedExperimentRunId);
  const runInFlight = useExperimentStore((s) => s.runInFlight);
  const chromeLive = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return !tab?.composerToolsSuppressed;
  });
  const permissionGate = usePermissionGateState();
  const permissionOpen = permissionGate.show;
  const permissionPeek = permissionGate.peekLabel;

  const questionPeek = useMemo(() => {
    if (!questionId) return null;
    const pending = resolveComposerPendingQuestion(useChatStore.getState());
    const q = pending?.toolUse.input?.question;
    if (typeof q === "string" && q.trim()) {
      return q.trim().slice(0, 72);
    }
    return t("chat.questionPanel.title");
  }, [questionId, streamTick, t]);

  const todoPeek = useMemo(() => {
    if (!todoId) return null;
    const pending = resolveComposerPendingTodo(useChatStore.getState());
    const todos = pending?.toolUse.input?.todos;
    if (Array.isArray(todos) && todos.length > 0) {
      const completed = todos.filter((item: { status?: string }) => item.status === "completed").length;
      return `${t("chat.composer.taskPlanTitle")} · ${completed}/${todos.length}`;
    }
    return t("chat.composer.taskPlanTitle");
  }, [todoId, streamTick, t]);

  const experimentPeek = useMemo(() => {
    if (runInFlight?.command?.trim()) {
      return runInFlight.command.trim().slice(0, 72);
    }
    const pending = resolveComposerPendingExperimentRun(useChatStore.getState());
    if (pending?.command) return pending.command.slice(0, 72);
    return t("chat.composer.experimentRunTitle");
  }, [runInFlight?.command, runInFlight?.runId, experimentRunId, streamTick, t]);

  return useMemo(() => {
    const items: ComposerChromeStackItem[] = [];

    if (permissionOpen && permissionPeek) {
      items.push({
        id: "permission-gate",
        order: 0,
        peekLabel: permissionPeek,
        content: <PermissionGatePanel gate={permissionGate} />,
      });
    }    if (planSuggestVisible) {
      items.push({
        id: "plan-suggest",
        order: 10,
        peekLabel: t("chat.planWorkflow.suggestTitle"),
        content: <PlanSuggestBar />,
      });
    }
    if (planChromeVisible) {
      items.push({
        id: "plan-chrome",
        order: 20,
        peekLabel: t("chat.planWorkflow.approveDrawerTitle"),
        content: <PlanChrome />,
      });
    }
    if (questionId && questionPeek) {
      items.push({
        id: "question",
        order: 30,
        peekLabel: questionPeek,
        content: <QuestionComposerPanel />,
      });
    }
    if (todoId && todoPeek) {
      items.push({
        id: "todo",
        order: 40,
        peekLabel: todoPeek,
        content: <TodoPlanBar />,
      });
    }
    const showExperiment =
      chromeLive
      && (runInFlight != null || experimentRunId != null);
    if (showExperiment) {
      items.push({
        id: "experiment-run",
        order: 50,
        peekLabel: experimentPeek,
        content: <ExperimentRunBar />,
      });
    }

    return items;
  }, [
    permissionGate,
    permissionOpen,
    permissionPeek,
    planSuggestVisible,
    planChromeVisible,
    questionId,
    questionPeek,
    todoId,
    todoPeek,
    experimentRunId,
    experimentPeek,
    runInFlight,
    chromeLive,
    t,
  ]);
}

/** Stacked composer chrome — overlapping cards above the input (hover to expand). */
export const ComposerChromeStack = memo(function ComposerChromeStack() {
  const items = useComposerChromeStackItems();
  if (items.length === 0) return null;
  return <ComposerChromeStackBody items={items} />;
});
import { useEffect, useMemo, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chat-store";
import {
  resolveComposerPendingQuestion,
  selectComposerHostedQuestionId,
} from "@/lib/chat/composer-pending-tools";
import {
  PermissionGatePanel,
  usePermissionGateState,
} from "./permission-gate-panel";
import { PlanSuggestBar } from "./plan-suggest-bar";
import { PlanChrome } from "./plan-chrome";
import { QuestionComposerPanel } from "./question-composer-panel";
import {
  ComposerChromeStackBody,
  type ComposerChromeStackItem,
} from "./composer-chrome-stack-body";

// Composer chrome is reserved for blocking, interactive surfaces (permission
// gate, plan approval, user questions). Experiment runs are not interactive —
// their live status streams in the message-flow tool card instead.
function useComposerChromeStackItems(): ComposerChromeStackItem[] {
  const { t } = useTranslation();

  const planSuggestVisible = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return !!tab?.planSuggestVisible && tab.sessionAgent === "build";
  });
  const planChromeVisible = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionAgent === "plan" && !!tab.planDraftFileReady && !tab.planConfirmSuppressed;
  });
  const questionId = useChatStore(selectComposerHostedQuestionId);
  const permissionGate = usePermissionGateState();
  const permissionOpen = permissionGate.show;
  const permissionPeek = permissionGate.peekLabel;

  // Only follow stream changes while a hosted question exists — an
  // unconditional streamTick subscription re-rendered the whole composer
  // chrome stack on every stream chunk.
  const [streamTick, setStreamTick] = useState(0);
  useEffect(() => {
    if (!questionId) return;
    setStreamTick(useChatStore.getState().streamTick);
    return useChatStore.subscribe((state, prev) => {
      if (state.streamTick !== prev.streamTick) {
        setStreamTick(state.streamTick);
      }
    });
  }, [questionId]);

  const questionPeek = useMemo(() => {
    if (!questionId) return null;
    const pending = resolveComposerPendingQuestion(useChatStore.getState());
    const q = pending?.toolUse.input?.question;
    if (typeof q === "string" && q.trim()) {
      return q.trim().slice(0, 72);
    }
    return t("chat.questionPanel.title");
  }, [questionId, streamTick, t]);

  return useMemo(() => {
    const items: ComposerChromeStackItem[] = [];

    if (permissionOpen && permissionPeek) {
      items.push({
        id: "permission-gate",
        order: 0,
        peekLabel: permissionPeek,
        content: <PermissionGatePanel gate={permissionGate} />,
      });
    }
    if (planSuggestVisible) {
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

    return items;
  }, [
    permissionGate,
    permissionOpen,
    permissionPeek,
    planSuggestVisible,
    planChromeVisible,
    questionId,
    questionPeek,
    t,
  ]);
}

/** Stacked composer chrome — overlapping cards above the input (hover to expand). */
export const ComposerChromeStack = memo(function ComposerChromeStack() {
  const items = useComposerChromeStackItems();
  if (items.length === 0) return null;
  return (
    <div data-composer-chrome>
      <ComposerChromeStackBody items={items} />
    </div>
  );
});

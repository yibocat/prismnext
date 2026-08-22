import type { StateCreator } from "zustand";
import type { ChatState } from "./model";
import {
  applyConversationToTab,
  conversationDisplayIndex,
  conversationKey,
  evictPlanDraftFromEditor,
  projectActiveTab,
} from "./model";
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { researchDesktop } from "@/lib/desktop-api/research";
import { useDocumentStore } from "../document-store";
import type { SessionAgent } from "../../../shared/agent/session-agent";
import type { ResearchPlanStep } from "../../../shared/research/plan";
import {
  buildApprovedPlanExecutePrompt,
  checklistToTodoSeeds,
  parsePlanChecklist,
  isResearchPlanDraftPath,
  PLAN_REJECT_ACK_PROMPT,
  extractPlanFrontmatterDescription,
  sessionDraftPlanRel,
} from "../../../shared/research/plan";

export const createChatPlanSlice: StateCreator<ChatState, [], [], Partial<ChatState>> = (set, get) => ({
  showPlanSuggest: (tabId?: string, reason?: string | null, opts?) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const clamped = (reason ?? "").trim();
    void import("@shared/research/plan-suggest").then(({ PLAN_SUGGEST_TIMEOUT_MS }) => {
      const deadlineAt = opts?.deadlineAt ?? Date.now() + PLAN_SUGGEST_TIMEOUT_MS;
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== resolvedTabId) return t;
          if (t.planSuggestDismissed || t.sessionAgent !== "build") return t;
          return {
            ...t,
            planSuggestVisible: true,
            planSuggestDeadlineAt: deadlineAt,
            planSuggestConsentSessionId:
              opts?.sessionId !== undefined
                ? opts.sessionId
                : (t.planSuggestConsentSessionId ?? t.sessionId),
            ...(clamped ? { planSuggestReason: clamped } : {}),
          };
        }),
      }));
    });
  },

  dismissPlanSuggest: (tabId?: string) => {
    void get().finishPlanSuggestConsent("dismissed", tabId);
  },

  timeoutPlanSuggest: (tabId?: string) => {
    void get().finishPlanSuggestConsent("timed_out", tabId);
  },

  acceptPlanSuggest: (tabId?: string) => {
    void get().finishPlanSuggestConsent("accepted", tabId);
  },

  finishPlanSuggestConsent: async (decision, tabId?) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    if (!tab?.planSuggestVisible) return;

    const requestId = tab.conversation.pendingPlanSuggest?.requestId;

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== resolvedTabId) return t;
        return {
          ...t,
          conversation: {
            ...t.conversation,
            pendingPlanSuggest: null,
          },
          planSuggestVisible: false,
          planSuggestReason: null,
          planSuggestDeadlineAt: null,
          planSuggestConsentSessionId: null,
          planSuggestDismissed:
            decision === "dismissed" || decision === "timed_out"
              ? true
              : t.planSuggestDismissed,
        };
      }),
    }));

    if (requestId) {
      const mapped = decision === "accepted" ? "accept" : "dismiss";
      void agentDesktop
        .agentResolvePlanSuggest({ requestId, decision: mapped })
        .catch(() => {});
    }

    if (decision === "accepted") {
      get().setSessionAgent("plan", resolvedTabId);
      void get().refreshPlanDraftFromDisk(resolvedTabId);
    }
  },

  setPlanDraftFromEvent: (steps: ResearchPlanStep[], title?: string | null, tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId
          ? {
              ...t,
              planDraftSteps: steps,
              ...(title !== undefined ? { planDraftTitle: title } : {}),
              // Do not mark dirty from checklist alone — formal draft is the file.
            }
          : t,
      ),
    }));
    void get().refreshPlanDraftFromDisk(resolvedTabId);
  },

  clearPlanDraft: (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId
          ? {
              ...t,
              planDraftSteps: [],
              planDraftTitle: null,
              planDraftSummary: null,
              planDraftDirty: false,
              planDraftFileReady: false,
              // Keep planArtifactCard — Deny marks discarded; clear only on new draft cycle.
            }
          : t,
      ),
    }));
  },

  refreshPlanDraftFromDisk: async (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot) return false;

    const sessionId = tab?.sessionId?.trim() || "";
    // Per-session draft; Approve chrome only when this chat session owns it.
    if (!sessionId) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === resolvedTabId
            ? { ...t, planDraftFileReady: false, planDraftDirty: false }
            : t,
        ),
      }));
      return false;
    }

    const wasReady = tab?.planDraftFileReady ?? false;

    const claimed = await researchDesktop.researchPlanClaimDraft({
      projectRoot,
      sessionId,
    });
    if (!claimed.ok) return false;

    const ready = claimed.owned && !claimed.ownedByOther;
    const draftPath = claimed.relativePath || sessionDraftPlanRel(sessionId);
    let summary: string | null = claimed.description?.trim() || null;
    if (ready && !summary) {
      const draft = await researchDesktop.researchPlanReadDraft({
        projectRoot,
        sessionId,
      });
      if (draft.ok && draft.markdown) {
        summary = extractPlanFrontmatterDescription(draft.markdown) || null;
      } else if (draft.ok && draft.description) {
        summary = draft.description.trim() || null;
      }
    }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId
          ? {
              ...t,
              planDraftFileReady: ready,
              planDraftDirty: ready,
              planDraftSummary: ready ? summary : null,
              ...(claimed.title ? { planDraftTitle: claimed.title } : {}),
            }
          : t,
      ),
    }));
    if (ready) {
      get().ensurePlanArtifactCard(resolvedTabId, {
        title: claimed.title,
        path: draftPath,
      });
    }
    const shouldAutoOpen =
      ready
      && !wasReady
      && tab?.sessionAgent === "plan"
      && !tab?.planConfirmSuppressed
      && resolvedTabId === get().activeTabId;
    if (shouldAutoOpen) {
      void get().openPlanFileInEditor(draftPath);
    }
    return ready;
  },

  ensurePlanArtifactCard: (tabId, args) => {
    const path = args.path.replace(/\\/g, "/");
    const title = args.title?.trim() || undefined;
    let afterIndex = 0;
    let conversationId = "";
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        conversationId = conversationKey(t);
        afterIndex = t.conversation.turns.length * 2 + (t.conversation.live ? 1 : 0);
        return {
          ...t,
          planArtifactCard: {
            path,
            title: title ?? t.planArtifactCard?.title,
            discarded: false,
          },
        };
      }),
    }));
    if (conversationId) {
      void agentDesktop.agentUpsertPlanArtifact({
        conversationId,
        event: {
          kind: "plan-artifact",
          path,
          title,
          discarded: false,
          afterIndex,
        },
      });
    }
  },

  openPlanFileInEditor: async (relativePath: string) => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot || !relativePath.trim()) return;
    const rel = relativePath.replace(/\\/g, "/");

    // Don't reopen a Deny-deleted draft from editor cache.
    if (isResearchPlanDraftPath(rel)) {
      const tab = get().tabs.find((t) => t.id === get().activeTabId);
      const draft = await researchDesktop.researchPlanReadDraft({
        projectRoot,
        sessionId: tab?.sessionId ?? undefined,
      });
      if (!draft.ok || !draft.exists || draft.empty) {
        toast.message(i18n.t("chat.planWorkflow.draftDiscardedGone"));
        return;
      }
      // Keep ready flags / toolbar in sync when opening Created Plan.
      void get().refreshPlanDraftFromDisk();
    }

    const { openProjectFileFromChat } = await import("@/lib/files/open-project-file");
    const ok = await openProjectFileFromChat(rel, { pin: true });
    if (!ok) {
      toast.message(i18n.t("chat.planWorkflow.planFileMissing"));
    }
  },

  openPlanDraftInEditor: async () => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    const sessionId = tab?.sessionId?.trim();
    if (!projectRoot || !sessionId) return;
    const draft = await researchDesktop.researchPlanReadDraft({
      projectRoot,
      sessionId,
    });
    if (!draft.ok) {
      toast.error(draft.error || i18n.t("chat.planWorkflow.saveFailed"));
      return;
    }
    if (!draft.exists || draft.empty) {
      toast.message(i18n.t("chat.planWorkflow.draftNotYet"));
      if (!draft.exists) return;
    }
    await get().refreshPlanDraftFromDisk();
    await get().openPlanFileInEditor(draft.relativePath || sessionDraftPlanRel(sessionId));
  },

  openPlanExitDialog: (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId ? { ...t, planExitDialogOpen: true } : t,
      ),
    }));
  },

  closePlanExitDialog: (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId ? { ...t, planExitDialogOpen: false } : t,
      ),
    }));
  },

  approveAndExecutePlan: async (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!tab || !projectRoot) return;

    const promoted = await researchDesktop.researchPlanPromoteDraft({
      projectRoot,
      sessionId: tab.sessionId ?? undefined,
    });
    if (!promoted.ok) {
      toast.error(promoted.error || i18n.t("chat.planWorkflow.approveNeedsContent"));
      return;
    }

    get().setSessionAgent("build", resolvedTabId);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId ? { ...t, composerToolsSuppressed: false } : t,
      ),
    }));
    get().clearPlanDraft(resolvedTabId);
    get().closePlanExitDialog(resolvedTabId);

    // Draft path was renamed away — drop stale editor buffer for this session's draft.
    evictPlanDraftFromEditor(tab.sessionId);

    // Point the in-stream plan card at the approved file + decision card.
    get().ensurePlanArtifactCard(resolvedTabId, {
      title: promoted.title,
      path: promoted.relativePath,
    });
    const afterApprove = conversationDisplayIndex(
      get().tabs.find((t) => t.id === resolvedTabId)?.conversation,
    );

    // Seed Task Plan UI immediately from Checklist — do not wait for the model.
    const todoSeeds = checklistToTodoSeeds(parsePlanChecklist(promoted.markdown));
    if (todoSeeds.length > 0) {
      set((s) => {
        const tabs = s.tabs.map((t) => {
          if (t.id !== resolvedTabId) return t;
          return applyConversationToTab(t, appendAssistantBlocksToLastTurn(t.conversation, [{
            type: "tool_use",
            name: "todowrite",
            id: `todo-approve-${Date.now()}`,
            input: { todos: todoSeeds },
          }]));
        });
        return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
      });
    }

    if (tab.sessionId) {
      void agentDesktop.agentAppendPlanDecision({
        conversationId: conversationKey(tab),
        event: {
          kind: "plan-decision",
          decision: "approved",
          path: promoted.relativePath,
          title: promoted.title,
          afterIndex: afterApprove,
        },
      });
    }

    await get().sendPrompt(
      buildApprovedPlanExecutePrompt({
        relativePath: promoted.relativePath,
        title: promoted.title,
        todos: todoSeeds,
      }),
      undefined,
      true,
    );
  },

  exitPlanDiscardAndBuild: async (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!tab) return;

    // Stop any in-flight Plan turn; keep the chat tab/session for further talk.
    if (tab.isStreaming && get().activeTabId === resolvedTabId) {
      await get().cancelExecution();
    }

    if (projectRoot) {
      await researchDesktop
        .researchPlanDiscardDraft({
          projectRoot,
          sessionId: tab.sessionId ?? undefined,
        })
        .catch(() => {});
    }

    const draftTitle = tab.planDraftTitle ?? undefined;
    const hadSession = !!tab.sessionId;

    // Evict draft from editor cache / RightArea so Deny can't reopen stale buffer.
    evictPlanDraftFromEditor(tab.sessionId);

    get().setSessionAgent("build", resolvedTabId);
    get().clearPlanDraft(resolvedTabId);
    get().closePlanExitDialog(resolvedTabId);

    // Mark Created Plan card discarded (inline card under write tool; no chevron).
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== resolvedTabId) return t;
        if (!t.planArtifactCard) return t;
        return {
          ...t,
          planArtifactCard: {
            ...t.planArtifactCard,
            path: "",
            discarded: true,
          },
        };
      }),
    }));

    const afterDeny = conversationDisplayIndex(
      get().tabs.find((t) => t.id === resolvedTabId)?.conversation,
    );

    if (tab.sessionId) {
      const conversationId = conversationKey(tab);
      void agentDesktop.agentMarkPlanArtifactDiscarded(conversationId);
      void agentDesktop.agentAppendPlanDecision({
        conversationId,
        event: {
          kind: "plan-decision",
          decision: "rejected",
          title: draftTitle,
          afterIndex: afterDeny,
        },
      });
    }

    // Brief agent acknowledgment — no user bubble; stripped again on hydrate.
    if (hadSession) {
      await get().sendPrompt(PLAN_REJECT_ACK_PROMPT, undefined, true);
    }
  },

});

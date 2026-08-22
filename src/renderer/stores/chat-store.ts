import { create } from "zustand";
import type { ChatState } from "./chat/model";
import {
  createInitialChatData,
  _msgCache,
  _msgCacheSetForTests,
  _msgCacheGetForTests,
  _msgCacheMaxForTests,
} from "./chat/model";
import { createChatTabsSlice } from "./chat/tabs";
import { createChatPlanSlice } from "./chat/plan";
import { createChatSendSlice } from "./chat/send";
import { createChatComposerQueueSlice } from "./chat/composer-queue";

export type { TurnMessageMeta } from "../../shared/agent/conversation";
export type { ChatStreamMessage, ContentBlock } from "@/lib/chat/types";
export type { SubAgentRun } from "./chat/model";
export { _msgCacheSetForTests, _msgCacheGetForTests, _msgCacheMaxForTests };

export const useChatStore = create<ChatState>()((...a) => ({
  ...createInitialChatData(),
  ...createChatTabsSlice(...a),
  ...createChatPlanSlice(...a),
  ...createChatSendSlice(...a),
  ...createChatComposerQueueSlice(...a),
}));

(useChatStore as any)._msgCache = _msgCache;

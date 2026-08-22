/**
 * Active Pi runtime bindings keyed by product conversationId.
 * Closing a tab disposes the in-memory handle; JSON / Pi session files stay.
 */

import {
  newConversationId,
  type ConversationBinding,
} from "../../shared/agent/conversation";
import type { PermissionMode, SessionAgent } from "../../shared/agent/session-agent";
import type { AgentTurnImage, TurnInput } from "../../shared/agent/runtime";
import type { AgentRuntime } from "./runtime";
import type { PermissionGate } from "./permission-gate";
import type { InteractionBroker } from "./interaction-broker";
import {
  AgentSessionStore,
  resolvePiAgentRoot,
} from "./session-store";
import { setSessionScratchLookup } from "../session/chat-session-registry";
import { createLogger } from "../app/logger";

const log = createLogger("runtime-registry", "agent");

export interface StartRuntimeInput {
  conversationId: string;
  tabId: string;
  projectRoot: string;
  boundCheckoutPath: string;
  piSessionFile?: string;
}

export interface StartedRuntime {
  runtime: AgentRuntime;
  runtimeSessionId: string;
  piSessionFile?: string;
  gate?: PermissionGate;
  interactions?: InteractionBroker;
}

export interface RuntimeRegistryOptions {
  userDataDir: string;
  store?: AgentSessionStore;
  startRuntime: (input: StartRuntimeInput) => Promise<StartedRuntime>;
}

interface LiveBinding {
  binding: ConversationBinding;
  runtime: AgentRuntime;
  runtimeSessionId: string;
  gate?: PermissionGate;
  interactions?: InteractionBroker;
}

export class RuntimeRegistry {
  readonly store: AgentSessionStore;
  private readonly startRuntime: RuntimeRegistryOptions["startRuntime"];
  private readonly live = new Map<string, LiveBinding>();

  constructor(opts: RuntimeRegistryOptions) {
    this.store = opts.store ?? new AgentSessionStore(resolvePiAgentRoot());
    this.startRuntime = opts.startRuntime;
    setSessionScratchLookup(this.store);
  }

  getBinding(conversationId: string): ConversationBinding | null {
    return this.live.get(conversationId)?.binding ?? null;
  }

  getRuntime(conversationId: string): AgentRuntime | null {
    return this.live.get(conversationId)?.runtime ?? null;
  }

  liveConversationIds(): string[] {
    return [...this.live.keys()];
  }

  async createConversation(input: {
    conversationId?: string;
    tabId: string;
    projectRoot: string;
    boundCheckoutPath?: string;
  }): Promise<ConversationBinding> {
    const conversationId = input.conversationId || newConversationId();
    const boundCheckoutPath = input.boundCheckoutPath || input.projectRoot;
    const started = await this.startRuntime({
      conversationId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      boundCheckoutPath,
    });
    const existing = this.store.getSession(started.runtimeSessionId)
      ?? this.store.getByConversationId(conversationId);
    if (existing) {
      this.store.put({
        ...existing,
        conversationId,
        tabId: input.tabId,
        piSessionFile: started.piSessionFile ?? existing.piSessionFile,
      });
    } else {
      this.store.createSession({
        conversationId,
        runtimeSessionId: started.runtimeSessionId,
        tabId: input.tabId,
        projectRoot: input.projectRoot,
        boundCheckoutPath,
        backend: "pi-sdk",
        piSessionFile: started.piSessionFile,
      });
    }
    const binding: ConversationBinding = {
      conversationId,
      tabId: input.tabId,
      runtimeSessionId: started.runtimeSessionId,
      piSessionFile: started.piSessionFile,
      backend: "pi",
    };
    this.live.set(conversationId, {
      binding,
      runtime: started.runtime,
      runtimeSessionId: started.runtimeSessionId,
      gate: started.gate,
      interactions: started.interactions,
    });
    return binding;
  }

  async openConversation(input: {
    conversationId: string;
    tabId: string;
    projectRoot: string;
  }): Promise<ConversationBinding> {
    const existing = this.store.getByConversationId(input.conversationId);
    if (!existing) throw new Error(`unknown_conversation:${input.conversationId}`);
    const started = await this.startRuntime({
      conversationId: input.conversationId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      boundCheckoutPath: existing.boundCheckoutPath,
      piSessionFile: existing.piSessionFile,
    });
    const binding: ConversationBinding = {
      conversationId: input.conversationId,
      tabId: input.tabId,
      runtimeSessionId: started.runtimeSessionId,
      piSessionFile: started.piSessionFile ?? existing.piSessionFile,
      backend: "pi",
    };
    this.store.put({
      ...existing,
      runtimeSessionId: started.runtimeSessionId,
      tabId: input.tabId,
      piSessionFile: binding.piSessionFile,
    });
    this.live.set(input.conversationId, {
      binding,
      runtime: started.runtime,
      runtimeSessionId: started.runtimeSessionId,
      gate: started.gate,
      interactions: started.interactions,
    });
    log.info("session.open", {
      conversationId: input.conversationId,
      runtimeSessionId: started.runtimeSessionId,
      persist: existing.piSessionFile || binding.piSessionFile ? "open" : "memory",
      hasPiSessionFile: Boolean(binding.piSessionFile),
    });
    return binding;
  }

  async sendTurn(input: {
    conversationId: string;
    tabId: string;
    turnId?: string;
    text: string;
    images?: AgentTurnImage[];
    attachments?: TurnInput["attachments"];
    sessionAgent?: SessionAgent;
    permissionMode: PermissionMode;
    provider?: string;
    modelId?: string;
    apiKey?: string;
  }): Promise<void> {
    const live = this.live.get(input.conversationId);
    if (!live) throw new Error(`unknown_conversation:${input.conversationId}`);
    await live.runtime.sendTurn({
      runtimeSessionId: live.runtimeSessionId,
      tabId: input.tabId,
      turnId: input.turnId,
      text: input.text,
      images: input.images,
      attachments: input.attachments,
      sessionAgent: input.sessionAgent,
      permissionMode: input.permissionMode,
      provider: input.provider,
      modelId: input.modelId,
      apiKey: input.apiKey,
    });
  }

  async cancelTurn(conversationId: string): Promise<void> {
    const live = this.live.get(conversationId);
    if (!live) return;
    await live.runtime.cancelTurn(live.runtimeSessionId);
  }

  async disposeConversation(conversationId: string): Promise<void> {
    const live = this.live.get(conversationId);
    if (!live) return;
    this.live.delete(conversationId);
    await live.runtime.disposeSession(live.runtimeSessionId).catch(() => {});
  }

  getLiveByRuntimeSessionId(runtimeSessionId: string): {
    conversationId: string;
    runtimeSessionId: string;
    runtime: AgentRuntime;
    gate?: PermissionGate;
    interactions?: InteractionBroker;
  } | null {
    for (const [conversationId, live] of this.live) {
      if (live.runtimeSessionId === runtimeSessionId) {
        return {
          conversationId,
          runtimeSessionId: live.runtimeSessionId,
          runtime: live.runtime,
          gate: live.gate,
          interactions: live.interactions,
        };
      }
    }
    return null;
  }

  cancelConversationWaiters(conversationId: string): string | null {
    const live = this.live.get(conversationId);
    if (!live) return null;
    live.gate?.cancelSession(live.runtimeSessionId);
    live.interactions?.cancelSession(live.runtimeSessionId);
    return live.runtimeSessionId;
  }

  resolvePermission(requestId: string, decision: "allow" | "deny"): boolean {
    for (const live of this.live.values()) {
      if (live.gate?.resolve(requestId, decision)) return true;
    }
    return false;
  }

  answerQuestion(
    requestId: string,
    payload: { answer?: string; selected?: string[] },
  ): boolean {
    for (const live of this.live.values()) {
      if (live.interactions?.resolveQuestion(requestId, payload)) return true;
    }
    return false;
  }

  resolvePlanSuggest(requestId: string, decision: "accept" | "dismiss"): boolean {
    for (const live of this.live.values()) {
      if (live.interactions?.resolvePlanSuggest(requestId, decision)) return true;
    }
    return false;
  }

  cancelHostWaiters(runtimeSessionId: string): void {
    const live = this.getLiveByRuntimeSessionId(runtimeSessionId);
    live?.gate?.cancelSession(runtimeSessionId);
    live?.interactions?.cancelSession(runtimeSessionId);
    live?.runtime.cancelPendingPermissions?.(runtimeSessionId);
  }
}

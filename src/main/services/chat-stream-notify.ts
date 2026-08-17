import { BrowserWindow } from "electron";
import {
  ChatStreamDeltaTracker,
  mapChatStreamToAgentEvent,
} from "../acp/chat-stream-map";
import type { AgentEvent } from "../../shared/agent-runtime";

const tracker = new ChatStreamDeltaTracker();

function sessionIdFromData(data: Record<string, unknown>): string | undefined {
  return typeof data.sessionId === "string" ? data.sessionId : undefined;
}

function messageIdFromData(data: Record<string, unknown>): string | undefined {
  return typeof data.messageId === "string" ? data.messageId : undefined;
}

/** Push a chat:stream event to all renderer windows (same envelope as EventMapper). */
export function emitChatStream(
  tabId: string,
  type: string,
  data: Record<string, unknown>,
): void {
  const payload = { tabId, type, data };
  // Map once — ChatStreamDeltaTracker is stateful; repeating per window
  // would swallow text deltas after the first send.
  const event = mapChatStreamToAgentEvent(payload, {
    runtimeSessionId: sessionIdFromData(data) ?? tabId,
    turnId: messageIdFromData(data) ?? "live",
    tracker,
  });
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send("chat:stream", payload);
    if (event) win.webContents.send("chat:agent-event", event);
  }
}

/** AgentEvent that has no matching `chat:stream` type (e.g. session_created). */
export function emitAgentEvent(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("chat:agent-event", event);
    }
  }
}

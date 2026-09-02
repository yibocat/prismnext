import type { PermissionMode, SessionAgent } from "./session-agent";

export interface AgentSendAttachment {
  name: string;
  kind: "image" | "file";
  path: string;
}

/** Inline image for a multimodal agent turn (base64, no data: prefix). */
export interface AgentSendImage {
  mimeType: string;
  /** Raw base64 image bytes (no data: prefix). */
  data: string;
  name?: string;
}

export interface AgentSendInput {
  conversationId: string;
  /** UI window id. Defaults to conversationId. Not a product primary key. */
  tabId?: string;
  turnId: string;
  projectRoot: string;
  /** Pi cwd. Worktree sessions use the home checkout; defaults to projectRoot. */
  boundCheckoutPath?: string;
  text: string;
  attachments?: AgentSendAttachment[];
  /** Inline images passed straight to the Pi session for vision-capable models. */
  images?: AgentSendImage[];
  /**
   * Composer file-strip / @ document attachments (`file://` URIs).
   * Main converts whitelist formats via AnyDoc and appends Markdown to `text`
   * before the Pi turn — the model never sees the raw Office bytes.
   */
  promptFiles?: Array<{
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
  }>;
  sessionTeamId?: string;
  provider?: string;
  modelId?: string;
  apiKey?: string;
  permissionMode?: PermissionMode;
  /** Current session agent (build | plan) — Pi runtime uses it for plan-mode prompts. */
  sessionAgent?: SessionAgent;
  /** Composer `/` MCP names for this turn. Empty / omitted = only autoStart servers. */
  mcpServerAllowlist?: string[];
  /** Composer `/` skills for this turn. Loaded via team binding extraSkillIds. */
  skillIds?: string[];
}

export interface AgentSendResult {
  ok: boolean;
  error?: string;
}

export interface AgentCancelSubagentInput {
  conversationId: string;
  toolCallId: string;
}

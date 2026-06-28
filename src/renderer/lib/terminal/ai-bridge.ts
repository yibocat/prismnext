import { resolveTerminalRoot } from "@/lib/terminal/root";
import { useDocumentStore } from "@/stores/document-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { usePermissionStore } from "@/stores/permission-store";
import { resolvePermissionMode, shouldPromptForPermission, resolveEffectiveAgentTerminalMode } from "@shared/permission-modes";

export { shouldAutoOpenAiTerminal } from "./ai-prefs";

export function isBashToolName(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n === "bash" || n === "shell" || n === "terminal" || n === "execute";
}

function extractCommand(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const cmd = input.command ?? input.cmd;
  if (typeof cmd === "string" && cmd.trim()) return cmd.trim();
  const title = input._title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "";
}

function extractCwd(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const cwd = input.workdir ?? input.cwd ?? input.working_directory;
  return typeof cwd === "string" ? cwd : undefined;
}

export interface BashResultContent {
  output: string;
  exitCode?: number;
  cwd?: string;
}

/** Normalize tool_result.content from string or structured bash payload. */
export function parseBashResultContent(content: unknown): BashResultContent {
  if (!content) return { output: "" };
  if (typeof content === "string") return { output: content };
  if (typeof content === "object" && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    const output =
      typeof obj.output === "string" ? obj.output
      : typeof obj.content === "string" ? obj.content
      : typeof obj.text === "string" ? obj.text
      : "";
    const exitRaw = obj.exitCode ?? obj.exit_code ?? obj.exit;
    const exitCode = typeof exitRaw === "number" ? exitRaw : undefined;
    const cwd = typeof obj.cwd === "string" ? obj.cwd : typeof obj.workdir === "string" ? obj.workdir : undefined;
    return { output, exitCode, cwd };
  }
  return { output: String(content) };
}

function resolveAgentShellCwd(inputCwd?: string): string | undefined {
  if (inputCwd?.trim()) return inputCwd.trim();
  const { checkoutRoot, projectRoot } = useDocumentStore.getState();
  return resolveTerminalRoot(checkoutRoot, projectRoot) ?? undefined;
}

function runPtyBashJob(
  chatTabId: string,
  toolCallId: string,
  command: string,
  input: Record<string, unknown> | undefined,
): void {
  const bash = useTerminalAiStore.getState().getBashForToolCall(toolCallId);
  if (bash?.status === "completed" || bash?.status === "running") return;

  const sessionId = useChatStore.getState().tabs.find((t) => t.id === chatTabId)?.sessionId;
  const shellCwd = extractCwd(input) ?? resolveAgentShellCwd();
  if (!sessionId || !shellCwd) return;

  void window.electronAPI.terminalRunAiBash({
    sessionId,
    chatTabId,
    toolCallId,
    command,
    cwd: shellCwd,
  });
}

function usesEffectivePty(): boolean {
  const settings = useSettingsStore.getState().settings;
  return resolveEffectiveAgentTerminalMode(
    settings.permissionMode,
    settings.agentTerminalMode,
  ) === "pty";
}

/**
 * PTY bash must not run until shell permission is granted.
 * Main process runs PTY on answerPermission; this is a renderer fallback only.
 */
export function tryExecutePtyBashAfterPermission(
  chatTabId: string,
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown> | undefined,
): void {
  if (!isBashToolName(toolName) || !toolCallId) return;

  if (!usesEffectivePty()) return;

  const permissionStore = usePermissionStore.getState();
  if (permissionStore.isToolDenied(chatTabId, toolCallId)) return;

  const permissionMode = resolvePermissionMode(
    useSettingsStore.getState().settings.permissionMode,
  );
  if (permissionMode === "readonly") return;

  if (shouldPromptForPermission(permissionMode, "bash")) {
    if (!permissionStore.isToolResolved(chatTabId, toolCallId)) return;
  }

  const command = extractCommand(input);
  if (!command) return;
  runPtyBashJob(chatTabId, toolCallId, command, input);
}

export function handleBashToolUse(
  chatTabId: string,
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown> | undefined,
): void {
  if (!isBashToolName(toolName) || !toolCallId) return;
  const command = extractCommand(input);
  if (!command) return;

  if (!useTerminalAiStore.getState().toolCallToChatTab[toolCallId]) {
    useTerminalAiStore.getState().onBashStart(
      chatTabId,
      toolCallId,
      command,
      extractCwd(input) ?? resolveAgentShellCwd(),
    );
  }

  tryExecutePtyBashAfterPermission(chatTabId, toolCallId, toolName, input);
}

export function handleBashToolResult(
  toolCallId: string,
  content: unknown,
  isError?: boolean,
): void {
  if (!toolCallId) return;
  const parsed = parseBashResultContent(content);
  const mode = usesEffectivePty() ? "pty" : (useSettingsStore.getState().settings.agentTerminalMode ?? "pty");
  if (mode === "pty") {
    useTerminalAiStore.getState().onBashOutputMeta(
      toolCallId,
      parsed.output,
      parsed.exitCode,
      isError,
    );
    return;
  }
  useTerminalAiStore.getState().onBashOutput(toolCallId, parsed.output, parsed.exitCode, isError);
}

export function handleBashPermissionDenied(
  chatTabId: string,
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown> | undefined,
): void {
  if (!isBashToolName(toolName) || !toolCallId) return;
  const command = extractCommand(input) || "(command)";
  useTerminalAiStore.getState().onBashDenied(chatTabId, toolCallId, command);
}

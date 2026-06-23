import { resolveTerminalRoot } from "@/lib/terminal/root";
import { useDocumentStore } from "@/stores/document-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";

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

  const mode = useSettingsStore.getState().settings.agentTerminalMode ?? "pty";
  if (mode === "pty") {
    const bash = useTerminalAiStore.getState().getBashForToolCall(toolCallId);
    if (bash?.status === "completed") return;

    const sessionId = useChatStore.getState().tabs.find((t) => t.id === chatTabId)?.sessionId;
    const shellCwd = extractCwd(input) ?? resolveAgentShellCwd();
    if (sessionId && shellCwd) {
      void window.electronAPI.terminalRunAiBash({
        sessionId,
        chatTabId,
        toolCallId,
        command,
        cwd: shellCwd,
      });
    }
  }
}

export function handleBashToolResult(
  toolCallId: string,
  content: unknown,
  isError?: boolean,
): void {
  if (!toolCallId) return;
  const parsed = parseBashResultContent(content);
  const mode = useSettingsStore.getState().settings.agentTerminalMode ?? "pty";
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

import { useEffect, useRef } from "react";
import { useClaudeChatStore, type ClaudeStreamMessage } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChangesStore } from "@/stores/changes-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";

// ─── ACP SessionNotification → batched text ───

interface AcpUpdate {
  sessionUpdate?: string;
  content?: { type?: string; text?: string } | null;
  toolCallId?: string;
  title?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: string;
  kind?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface AcpNotification {
  sessionId: string;
  update: AcpUpdate;
}

// ─── System prompt removal ───
// ACP delivers Claude's system prompt wrapped in XML tags.
// Strategy: strip known system blocks by tag FIRST, then remove
// any remaining preamble text that starts like a system directive.

const SYSTEM_TAG_RE = /<[^>]+>/g;

function stripSystemBlocks(text: string): string {
  // Remove known system/internal XML blocks and their content.
  let result = text;
  // System prompt blocks
  result = result.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  result = result.replace(/<EXTREMELY_IMPORTANT>[\s\S]*?<\/EXTREMELY_IMPORTANT>/g, "");
  result = result.replace(/<instructions>[\s\S]*?<\/instructions>/g, "");
  result = result.replace(/<function>[\s\S]*?<\/function>/g, "");
  result = result.replace(/<role>[\s\S]*?<\/role>/g, "");
  // Claude CLI local command blocks (saved in JSONL, should never be shown)
  result = result.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "");
  result = result.replace(/<command-name>[\s\S]*?<\/command-name>/g, "");
  result = result.replace(/<command-message>[\s\S]*?<\/command-message>/g, "");
  result = result.replace(/<command-args>[\s\S]*?<\/command-args>/g, "");
  result = result.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "");
  return result;
}

function stripSystemPreamble(text: string): string {
  // After XML blocks are removed, strip leading lines that are clearly
  // part of the system prompt (role description, rules, etc.)
  const lines = text.split("\n");
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { start = i + 1; continue; }
    // Stop stripping when we hit something that looks like a real response
    if (/^(Hey|Hi|Hello|Sure|OK|Let me|I'll|I will|Here|The|This|That|Alright|Great|Thanks|Based on|Looking at|First|Let's|I can|I see|I found|I notice|I've)/i.test(line)) {
      start = i;
      break;
    }
    // Keep stripping system-like lines
    if (/^(You are|IMPORTANT|System|Rules|Instructions|Tools|Environment|Working|Current|Available|When|Always|Never|Your|The user|\[|#|```)/i.test(line)) {
      start = i + 1;
      continue;
    }
    // Unknown line → might be real content, stop here
    start = i;
    break;
  }
  return lines.slice(start).join("\n").trim();
}

function cleanTextForDisplay(raw: string): string {
  let text = stripSystemBlocks(raw);
  text = stripSystemPreamble(text);
  // Remove remaining XML tags for display
  text = text.replace(SYSTEM_TAG_RE, "").trim();
  return text;
}

// ─── Hook ───

export function useClaudeEvents() {
  // Per-tab tracking
  const pendingToolUsesRef = useRef(new Map<string, Map<string, { name: string; input: any; oldContent?: string }>>());
  const hasTexChangesRef = useRef(new Map<string, boolean>());
  const aiSessionActiveRef = useRef(new Map<string, boolean>());
  const fileContentTrackerRef = useRef(new Map<string, string>());

  // Per-tab text/thinking accumulation (running total for entire turn)
  const textTotalRef = useRef(new Map<string, string>());
  const thinkTotalRef = useRef(new Map<string, string>());
  const flushTimerRef = useRef(new Map<string, number>());

  function getTabMap<T>(ref: Map<string, T>, tabId: string, init: () => T): T {
    if (!ref.has(tabId)) ref.set(tabId, init());
    return ref.get(tabId)!;
  }

  function clearTabMaps(tabId: string) {
    pendingToolUsesRef.current.delete(tabId);
    hasTexChangesRef.current.delete(tabId);
    aiSessionActiveRef.current.delete(tabId);
    fileContentTrackerRef.current.clear();
    textTotalRef.current.delete(tabId);
    thinkTotalRef.current.delete(tabId);
  }

  function registerProposedChange(
    filePath: string,
    toolUseId: string,
    toolName: string,
    toolInput: any,
    capturedOldContent: string,
  ) {
    const docState = useDocumentStore.getState();
    const projectRoot = docState.projectRoot;

    let relativePath = filePath;
    if (projectRoot && filePath.startsWith(projectRoot)) {
      relativePath = filePath.slice(projectRoot.length).replace(/^\//, "");
    }

    const file = docState.files.find(
      (f) => f.relativePath === relativePath || f.absolutePath === filePath,
    );
    if (!file) {
      console.log("[changes] file not found:", filePath);
      return;
    }

    const trackedContent = fileContentTrackerRef.current.get(file.relativePath);
    const fallback = capturedOldContent || docState.getContent(file.id) || "";
    const oldContent = trackedContent ?? fallback;

    const name = toolName.toLowerCase();

    let newContent: string;

    if (name === "write") {
      newContent = toolInput?.content ?? "";
    } else if (name === "multiedit" && Array.isArray(toolInput?.edits)) {
      newContent = oldContent;
      for (const edit of toolInput.edits) {
        const oldStr: string = edit.old_string ?? "";
        const newStr: string = edit.new_string ?? "";
        if (oldStr === "" && newStr === "") continue;
        const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newContent = newContent.replace(new RegExp(escaped, "g"), newStr);
      }
    } else if (name === "edit") {
      const oldStr: string = toolInput?.old_string ?? "";
      const newStr: string = toolInput?.new_string ?? "";
      if (oldStr === "" && newStr === "") {
        console.log("[changes] empty edit — skipping");
        return;
      }
      const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newContent = oldContent.replace(new RegExp(escaped, "g"), newStr);
    } else {
      console.log("[changes] unknown tool:", toolName);
      return;
    }

    console.log("[changes] detected", {
      tool: toolName,
      file: file.relativePath,
      oldLen: oldContent.length,
      newLen: newContent.length,
      changed: oldContent !== newContent,
    });

    if (oldContent !== newContent) {
      fileContentTrackerRef.current.set(file.relativePath, newContent);

      useChangesStore.getState().addChange({
        id: toolUseId,
        filePath: file.relativePath,
        absolutePath: file.absolutePath,
        oldContent: capturedOldContent || docState.getContent(file.id) || "",
        newContent,
        toolName,
      });
      console.log("[changes] registered for", file.relativePath);
    } else {
      console.log("[changes] no difference — skipped");
    }
  }

  // ─── Buffered message emission ───

  function flushTextBuffer(tabId: string) {
    const chatStore = useClaudeChatStore.getState();
    const rawText = textTotalRef.current.get(tabId) || "";
    const rawThink = thinkTotalRef.current.get(tabId) || "";

    // Skip if text contains local command tags (Claude CLI internal messages)
    const hasLocalCommand = /<\/?(?:local-command-caveat|command-name|command-message|command-args|local-command-stdout)>/i;

    // Clean system prompt from accumulated raw text
    const text = hasLocalCommand.test(rawText) ? "" : cleanTextForDisplay(rawText);
    const think = hasLocalCommand.test(rawThink) ? "" : cleanTextForDisplay(rawThink);

    if (think) {
      chatStore._upsertLastMessage(tabId, {
        type: "assistant",
        message: { content: [{ type: "thinking", thinking: think }] },
      });
    }

    if (text) {
      chatStore._upsertLastMessage(tabId, {
        type: "assistant",
        message: { content: [{ type: "text", text }] },
      });
    }

    const timer = flushTimerRef.current.get(tabId);
    if (timer) clearTimeout(timer);
    flushTimerRef.current.delete(tabId);
  }

  function scheduleFlush(tabId: string) {
    if (flushTimerRef.current.has(tabId)) return;
    const timer = window.setTimeout(() => flushTextBuffer(tabId), 80);
    flushTimerRef.current.set(tabId, timer);
  }

  useEffect(() => {
    // ─── Agent Stream Handler (ACP format) ───
    const unsubStream = window.electronAPI.onAgentStream(({ tabId, data }) => {
      const chatStore = useClaudeChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab?.isStreaming) return;

      let notif: AcpNotification;
      try {
        notif = JSON.parse(data);
      } catch {
        return;
      }

      const { update } = notif;
      if (!update) return;

      const type = update.sessionUpdate;
      const pendingTools = getTabMap(pendingToolUsesRef.current, tabId, () => new Map());

      switch (type) {
        case "agent_message_chunk": {
          const raw = update.content?.text;
          if (!raw) break;

          // Accumulate raw text (keep XML tags for system block detection)
          const total = textTotalRef.current.get(tabId) || "";
          textTotalRef.current.set(tabId, total + raw);
          scheduleFlush(tabId);
          break;
        }

        case "agent_thought_chunk": {
          const raw = update.content?.text;
          if (!raw) break;

          // Accumulate raw thinking (keep XML tags for system block detection)
          const total = thinkTotalRef.current.get(tabId) || "";
          thinkTotalRef.current.set(tabId, total + raw);
          scheduleFlush(tabId);
          break;
        }

        case "tool_call": {
          // Flush pending text, then reset accumulators so the next
          // thinking phase starts fresh (no duplicate thinking blocks)
          flushTextBuffer(tabId);
          textTotalRef.current.set(tabId, "");
          thinkTotalRef.current.set(tabId, "");

          if (!update.toolCallId) break;

          const msg: ClaudeStreamMessage = {
            type: "assistant",
            message: {
              content: [{
                type: "tool_use",
                id: update.toolCallId,
                name: update.title || "",
                input: update.rawInput,
              }],
            },
          };

          // Track tool_use for change detection
          const name = (update.title || "").toLowerCase();
          if (name === "write" || name === "edit" || name === "multiedit") {
            let oldContent: string | undefined;
            const rawInput = update.rawInput as any;
            const fp = rawInput?.file_path || rawInput?.path;
            if (fp && /\.(tex|bib|sty|cls)$/i.test(fp)) {
              const docState = useDocumentStore.getState();
              const projectRoot = docState.projectRoot;
              let relativePath = fp;
              if (projectRoot && fp.startsWith(projectRoot)) {
                relativePath = fp.slice(projectRoot.length).replace(/^\//, "");
              }
              const file = docState.files.find(
                (f) => f.relativePath === relativePath || f.absolutePath === fp,
              );
              if (file) {
                oldContent = docState.getContent(file.id) ?? "";
              }
            }
            pendingTools.set(update.toolCallId, { name: update.title || "", input: rawInput, oldContent });
          }

          chatStore._appendMessage(tabId, msg);
          break;
        }

        case "tool_call_update": {
          flushTextBuffer(tabId);
          textTotalRef.current.set(tabId, "");
          thinkTotalRef.current.set(tabId, "");

          if (!update.toolCallId) break;

          const msg: ClaudeStreamMessage = {
            type: "user",
            message: {
              content: [{
                type: "tool_result",
                tool_use_id: update.toolCallId,
                content: update.rawOutput,
                is_error: update.status === "failed",
              }],
            },
          };

          // Detect .tex file modifications
          const toolUse = pendingTools.get(update.toolCallId);
          if (
            toolUse &&
            update.status !== "failed" &&
            /^(Write|write|Edit|edit|MultiEdit|multiedit)$/.test(toolUse.name)
          ) {
            const fp = toolUse.input?.file_path || toolUse.input?.path;
            if (fp && /\.(tex|bib|sty|cls)$/i.test(fp)) {
              registerProposedChange(fp, update.toolCallId!, toolUse.name, toolUse.input, toolUse.oldContent ?? "");
              hasTexChangesRef.current.set(tabId, true);
            }
          }

          chatStore._appendMessage(tabId, msg);
          break;
        }

        case "usage_update": {
          if (update.usage) {
            chatStore._appendMessage(tabId, {
              type: "result",
              usage: {
                input_tokens: update.usage.inputTokens || 0,
                output_tokens: update.usage.outputTokens || 0,
              },
            });
          }
          break;
        }
      }

      // Track AI session start (first agent message)
      const isNewAISession = !aiSessionActiveRef.current.get(tabId);
      if (isNewAISession) {
        aiSessionActiveRef.current.set(tabId, true);
        pauseAutoCompileForAi();
      }
    });

    // ─── Agent Complete Handler ───
    const unsubComplete = window.electronAPI.onAgentComplete(({ tabId, success, error }) => {
      // Flush any remaining buffered text
      flushTextBuffer(tabId);

      const chatStore = useClaudeChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);

      if (!success && !tab?.error && error) {
        chatStore._setError(tabId, error);
      }

      chatStore._setStreaming(tabId, false);

      // Auto-recompile if tex files changed
      if (hasTexChangesRef.current.get(tabId)) {
        const docState = useDocumentStore.getState();
        docState.refreshFiles().then(() => {
          compileCurrentDocument();
        });
      }

      // Resume auto-compile
      if (aiSessionActiveRef.current.get(tabId)) {
        resumeAutoCompileAfterAi();
      }

      clearTabMaps(tabId);
    });

    // ─── Agent Stderr Handler ───
    const unsubStderr = window.electronAPI.onAgentStderr(({ tabId, data }) => {
      console.warn("[agent stderr]", tabId, data);
    });

    return () => {
      unsubStream();
      unsubComplete();
      unsubStderr();
    };
  }, []);
}

import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChatTabId } from "../session/chat-session-registry";
import {
  getExecutionRegistry,
  initExecutionRegistry,
  type ExecutionRegistry,
} from "./execution-registry";
import { terminalExecutionIsFinal, type TerminalExecutionSummary } from "../../shared/execution";
import { createLogger } from "../app/logger";
import { matchReservedBashOp } from "../../shared/permissions/reserved-ops";
import {
  isWholeDiskSearchBashCommand,
  wholeDiskSearchBlockMessage,
} from "../../shared/permissions/project-escape-guard";
import { gateExperimentPythonExecution } from "../experiment/facade";

const log = createLogger("ai-bash-runner", "agent");

export interface RunAiBashJobArgs {
  sessionId: string;
  chatTabId?: string;
  toolCallId: string;
  command: string;
  cwd: string;
  /** Optional project root hint (session cwd). */
  projectRoot?: string;
}

export interface RunAiBashJobResult {
  output: string;
  exitCode: number;
  cwd: string;
  executionId: string;
}

const inFlight = new Map<string, Promise<RunAiBashJobResult>>();

/** @deprecated Job output is broadcast via execution:event; kept for caller compatibility. */
export function setAiBashRunnerWindow(_win: unknown): void {}

function resultFromSummary(
  summary: TerminalExecutionSummary,
  cwd: string,
): RunAiBashJobResult {
  return {
    output: summary.transcriptTail ?? "",
    exitCode: summary.exitCode ?? 1,
    cwd,
    executionId: summary.executionId,
  };
}

async function reuseExistingExecution(
  registry: ExecutionRegistry,
  existing: TerminalExecutionSummary,
  args: RunAiBashJobArgs,
): Promise<RunAiBashJobResult> {
  const final = terminalExecutionIsFinal(existing.state)
    ? existing
    : await registry.waitForFinal(existing.executionId);
  return resultFromSummary(final, args.cwd);
}

function resolveChatTab(sessionId: string, chatTabId?: string): string {
  return chatTabId || resolveChatTabId(sessionId) || sessionId;
}

function jobKey(sessionId: string, toolCallId: string): string {
  return `${sessionId}:${toolCallId}`;
}

function requireRegistry(): ExecutionRegistry {
  try {
    return getExecutionRegistry();
  } catch {
    return initExecutionRegistry(
      process.env.PRISM_EXECUTION_HISTORY_ROOT ?? join(tmpdir(), "prism-execution-history"),
    );
  }
}

/** Leftover IPC hook — OpenCode used to poll a marker file. No-op on the Pi path. */
export function registerBashJobIntent(_args: {
  sessionId: string;
  toolCallId: string;
  command: string;
}): void {}

/** Run one AI bash job (PTY). Deduped per session + toolCallId. */
export function runAiBashJob(args: RunAiBashJobArgs): Promise<RunAiBashJobResult> {
  const key = jobKey(args.sessionId, args.toolCallId);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const chatTabId = resolveChatTab(args.sessionId, args.chatTabId);

  const failWithoutSpawn = async (output: string, reason: string): Promise<RunAiBashJobResult> => {
    const registry = requireRegistry();
    const created = await registry.create(
      {
        origin: "agent-bash",
        command: args.command,
        cwd: args.cwd,
        projectId: args.projectRoot || args.cwd,
        chatTabId,
        opencodeSessionId: args.sessionId,
        toolCallId: args.toolCallId,
      },
      { start: false },
    );
    await registry.reject(created.executionId, { output, exitCode: 1 });
    const blocked: RunAiBashJobResult = {
      output,
      exitCode: 1,
      cwd: args.cwd,
      executionId: created.executionId,
    };
    log.warn(reason, { chatTabId, command: args.command.slice(0, 120) });
    return blocked;
  };

  const reserved = matchReservedBashOp(args.command);
  if (reserved) {
    return failWithoutSpawn(reserved.message, `AI bash blocked by reserved op ${reserved.id}`);
  }

  if (isWholeDiskSearchBashCommand(args.command)) {
    return failWithoutSpawn(wholeDiskSearchBlockMessage(), "AI bash blocked by whole-disk search gate");
  }

  const gate = gateExperimentPythonExecution({
    projectRoot: args.projectRoot,
    cwd: args.cwd,
    command: args.command,
    blockBashPythonScripts: true,
  });

  if (gate.action === "block") {
    return failWithoutSpawn(gate.error, "AI bash blocked by experiment Python gate");
  }

  const envExtra = gate.action === "apply" ? gate.envExtra : undefined;

  const promise = (async () => {
    const registry = requireRegistry();
    const existing = registry.findByToolCallId(args.toolCallId);
    if (existing) {
      return reuseExistingExecution(registry, existing, args);
    }
    const created = await registry.create(
      {
        origin: "agent-bash",
        command: args.command,
        cwd: args.cwd,
        projectId: args.projectRoot || args.cwd,
        chatTabId,
        opencodeSessionId: args.sessionId,
        toolCallId: args.toolCallId,
        envExtra,
      },
      { start: false },
    );
    try {
      await registry.start(created.executionId);
      const final = await registry.waitForFinal(created.executionId);
      const result = resultFromSummary(final, args.cwd);
      log.info("AI bash job finished", { chatTabId, exitCode: result.exitCode });
      return result;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** @internal */
export function _resetAiBashRunnerForTests(): void {
  inFlight.clear();
}

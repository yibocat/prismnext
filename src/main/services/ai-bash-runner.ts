import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getTerminalBridgeRoot } from "./prism-bridge-paths";
import { resolveChatTabId, getSessionProjectRoot } from "./chat-session-registry";
import {
  getExecutionRegistry,
  initExecutionRegistry,
  type ExecutionRegistry,
} from "./execution-registry";
import { terminalExecutionIsFinal, type TerminalExecutionSummary } from "../../shared/execution";
import { createLogger } from "./logger";
import { matchReservedBashOp } from "../../shared/reserved-ops";
import {
  isWholeDiskSearchBashCommand,
  wholeDiskSearchBlockMessage,
} from "../../shared/project-escape-guard";
import { gateExperimentPythonExecution } from "./experiment-log-service";

const log = createLogger("ai-bash-runner", "agent");

export interface RunAiBashJobArgs {
  sessionId: string;
  chatTabId?: string;
  toolCallId: string;
  command: string;
  cwd: string;
  /** Optional project root hint (OpenCode session directory). */
  projectRoot?: string;
}

export interface RunAiBashJobResult {
  output: string;
  exitCode: number;
  cwd: string;
  executionId: string;
}

function getBridgeRoot(): string {
  return getTerminalBridgeRoot();
}

const inFlight = new Map<string, Promise<RunAiBashJobResult>>();

/** @deprecated Job output is broadcast via execution:event; kept for caller compatibility. */
export function setAiBashRunnerWindow(_win: unknown): void {}

function writeBridgeResult(
  resPath: string,
  streamPath: string | undefined,
  result: RunAiBashJobResult,
): void {
  try {
    writeFileSync(resPath, JSON.stringify(result), "utf-8");
  } catch {
    // ignore
  }
  if (streamPath && result.output) {
    try {
      writeFileSync(streamPath, result.output, "utf-8");
    } catch {
      // ignore
    }
  }
}

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
  resPath: string,
  streamPath: string,
): Promise<RunAiBashJobResult> {
  const final = terminalExecutionIsFinal(existing.state)
    ? existing
    : await registry.waitForFinal(existing.executionId);
  const result = resultFromSummary(final, args.cwd);
  writeBridgeResult(resPath, streamPath, result);
  return result;
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

/** Register pending bash job before user approves — OpenCode polls bridge by sessionId. */
export function registerBashJobIntent(args: {
  sessionId: string;
  toolCallId: string;
  command: string;
}): void {
  const sessionDir = join(getBridgeRoot(), args.sessionId);
  mkdirSync(sessionDir, { recursive: true });
  try {
    writeFileSync(
      join(sessionDir, ".active-tool.json"),
      JSON.stringify({
        toolCallId: args.toolCallId,
        command: args.command,
        startedAt: Date.now(),
        phase: "awaiting_approval",
      }),
      "utf-8",
    );
  } catch {
    // ignore
  }
}

/** Run one AI bash job (PTY). Deduped per session + toolCallId. */
export function runAiBashJob(args: RunAiBashJobArgs): Promise<RunAiBashJobResult> {
  const key = jobKey(args.sessionId, args.toolCallId);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const chatTabId = resolveChatTab(args.sessionId, args.chatTabId);
  const sessionDir = join(getBridgeRoot(), args.sessionId);
  const streamPath = join(sessionDir, `${args.toolCallId}.stream`);
  const resPath = join(sessionDir, `${args.toolCallId}.result.json`);

  mkdirSync(sessionDir, { recursive: true });
  try {
    writeFileSync(
      join(sessionDir, `${args.toolCallId}.meta.json`),
      JSON.stringify({
        toolCallId: args.toolCallId,
        command: args.command,
        cwd: args.cwd,
        chatTabId,
      }),
      "utf-8",
    );
    writeFileSync(
      join(sessionDir, ".active-tool.json"),
      JSON.stringify({
        toolCallId: args.toolCallId,
        command: args.command,
        startedAt: Date.now(),
      }),
      "utf-8",
    );
  } catch {
    // ignore
  }

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
    writeBridgeResult(resPath, undefined, blocked);
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
      return reuseExistingExecution(registry, existing, args, resPath, streamPath);
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
    const unsubscribe = registry.subscribe((event) => {
      if (event.executionId !== created.executionId || event.type !== "output" || !event.data) return;
      try {
        appendFileSync(streamPath, event.data, "utf-8");
      } catch {
        // ignore
      }
    });
    try {
      await registry.start(created.executionId);
      const final = await registry.waitForFinal(created.executionId);
      const result = resultFromSummary(final, args.cwd);
      writeBridgeResult(resPath, undefined, result);
      log.info("AI bash job finished", { chatTabId, exitCode: result.exitCode });
      return result;
    } finally {
      unsubscribe();
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Poll-based bridge entry (custom bash.ts). */
export async function runAiBashFromBridgeRequest(
  sessionId: string,
  sessionDirName: string,
  requestId: string,
  req: {
    command: string;
    cwd: string;
    toolCallId?: string;
    chatTabId?: string;
    rendererTabId?: string;
  },
): Promise<RunAiBashJobResult> {
  const toolCallId = req.toolCallId || requestId;
  const sessionKey = sessionId || sessionDirName;
  return runAiBashJob({
    sessionId: sessionKey,
    chatTabId: req.rendererTabId || req.chatTabId,
    toolCallId,
    command: req.command,
    cwd: req.cwd || process.cwd(),
    // Bridge requests carry no project root — resolve it from the session
    // registry so the Python gate never falls into its no-root passthrough
    // while the session is in fact inside a project.
    projectRoot: getSessionProjectRoot(sessionKey),
  });
}

/** @internal */
export function _resetAiBashRunnerForTests(): void {
  inFlight.clear();
}

/** @internal */
export function _readBridgeResultForTests(sessionId: string, toolCallId: string): RunAiBashJobResult | null {
  const resPath = join(getBridgeRoot(), sessionId, `${toolCallId}.result.json`);
  if (!existsSync(resPath)) return null;
  return JSON.parse(readFileSync(resPath, "utf-8")) as RunAiBashJobResult;
}

import { describe, expect, it } from "vitest";
import {
  isChatScopedExecution,
  isTerminalExecutionState,
  resolveTerminalExecutionSettings,
  terminalExecutionIsFinal,
  toTerminalExecutionSettingsPatch,
} from "../../src/shared/execution";

describe("terminal execution state", () => {
  it("accepts only declared states", () => {
    expect(isTerminalExecutionState("running")).toBe(true);
    expect(isTerminalExecutionState("shell")).toBe(false);
  });

  it("treats terminal outcomes as final", () => {
    expect(terminalExecutionIsFinal("completed")).toBe(true);
    expect(terminalExecutionIsFinal("cancel-requested")).toBe(false);
  });

  it("scopes only real chat bash to one conversation window", () => {
    expect(isChatScopedExecution({ origin: "agent-bash", chatTabId: "chat-1" })).toBe(true);
    expect(isChatScopedExecution({ origin: "agent-bash", chatTabId: "experiment" })).toBe(false);
    expect(isChatScopedExecution({ origin: "experiment-run", chatTabId: "chat-1" })).toBe(false);
  });
});

describe("terminal execution settings", () => {
  it("defaults Job Monitor to attach-only close and auto-open", () => {
    expect(resolveTerminalExecutionSettings(undefined)).toEqual({
      jobMonitorAutoOpen: true,
      jobMonitorCloseCancels: false,
      jobMonitorKeepFinishedMs: 60_000,
      jobMonitorIdleCloseMs: 600_000,
    });
  });

  it("migrates legacy AI terminal keys until consumers switch", () => {
    expect(
      resolveTerminalExecutionSettings({
        aiTerminalAutoOpen: false,
        aiTerminalCloseTabKillsProcess: true,
        aiTerminalPostExitGraceMs: 30_000,
        aiTerminalIdleCloseMs: 300_000,
      }),
    ).toEqual({
      jobMonitorAutoOpen: false,
      jobMonitorCloseCancels: true,
      jobMonitorKeepFinishedMs: 30_000,
      jobMonitorIdleCloseMs: 300_000,
    });
  });

  it("lets new Job Monitor keys win over legacy aliases", () => {
    expect(
      resolveTerminalExecutionSettings({
        jobMonitorAutoOpen: true,
        jobMonitorCloseCancels: false,
        aiTerminalAutoOpen: false,
        aiTerminalCloseTabKillsProcess: true,
      }),
    ).toMatchObject({
      jobMonitorAutoOpen: true,
      jobMonitorCloseCancels: false,
    });
  });

  it("writes Job Monitor keys and legacy aliases together", () => {
    expect(
      toTerminalExecutionSettingsPatch(
        { jobMonitorAutoOpen: false, jobMonitorCloseCancels: true },
        { aiTerminalAutoOpen: true },
      ),
    ).toMatchObject({
      jobMonitorAutoOpen: false,
      jobMonitorCloseCancels: true,
      aiTerminalAutoOpen: false,
      aiTerminalCloseTabKillsProcess: true,
    });
  });
});

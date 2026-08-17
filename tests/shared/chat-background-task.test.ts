import { describe, it, expect } from "vitest";
import {
  extractBackgroundTaskSessionId,
  isBackgroundTaskInjectMessageText,
  isBackgroundTaskJoinInject,
  isBackgroundTaskStartedResult,
  parseBackgroundTaskMarkup,
} from "../../src/shared/chat-background-task";

const STARTED_XML = `<task id="ses_child1" state="running">
<summary>Background task started</summary>
<task_result>
The task is working in the background. You will be notified when it completes.
</task_result>
</task>`;

const DONE_XML = `<task id="ses_child1" state="completed">
<summary>Background task completed: audit cites</summary>
<task_result>All good.</task_result>
</task>`;

const ERROR_XML = `<task id="ses_child1" state="error">
<summary>Background task failed</summary>
<task_error>boom</task_error>
</task>`;

describe("opencode-background-task", () => {
  it("detects started from metadata.background", () => {
    expect(
      isBackgroundTaskStartedResult({
        metadata: { background: true, jobId: "ses_child1" },
        content: STARTED_XML,
      }),
    ).toBe(true);
  });

  it("detects started from XML + prose without metadata", () => {
    expect(isBackgroundTaskStartedResult({ content: STARTED_XML })).toBe(true);
  });

  it("does not treat completed inject as started", () => {
    expect(
      isBackgroundTaskStartedResult({
        metadata: { background: true },
        content: DONE_XML,
      }),
    ).toBe(false);
    expect(isBackgroundTaskStartedResult({ content: DONE_XML })).toBe(false);
  });

  it("parses join inject with status=completed (live OpenCode shape)", () => {
    const live = `<task id="run_abc123" status="completed">
<summary>Background task completed: neural nets</summary>
<task_result>Done.</task_result>
</task>`;
    expect(parseBackgroundTaskMarkup(live)).toMatchObject({
      sessionId: "run_abc123",
      state: "completed",
      body: "Done.",
    });
    expect(isBackgroundTaskJoinInject(live)).toBe(true);
    expect(isBackgroundTaskInjectMessageText(live)).toBe(true);
  });

  it("parses standalone task_result id+status inject", () => {
    const live = `<task_result id="ses_61d53bdbff6e040c5b36789f" status="completed"><summary>Background task completed: 两个Task的所有输出都已写入Summary.</summary></task_result>`;
    expect(parseBackgroundTaskMarkup(live)).toMatchObject({
      sessionId: "ses_61d53bdbff6e040c5b36789f",
      state: "completed",
      summary: "Background task completed: 两个Task的所有输出都已写入Summary.",
    });
    expect(isBackgroundTaskJoinInject(live)).toBe(true);
    expect(isBackgroundTaskInjectMessageText(live)).toBe(true);
  });

  it("parses join inject completed/error via state=", () => {
    expect(parseBackgroundTaskMarkup(DONE_XML)).toMatchObject({
      sessionId: "ses_child1",
      state: "completed",
      body: "All good.",
    });
    expect(parseBackgroundTaskMarkup(ERROR_XML)).toMatchObject({
      sessionId: "ses_child1",
      state: "error",
      body: "boom",
    });
    expect(isBackgroundTaskJoinInject(DONE_XML)).toBe(true);
    expect(isBackgroundTaskJoinInject(STARTED_XML)).toBe(false);
  });

  it("extracts session id from metadata or markup", () => {
    expect(
      extractBackgroundTaskSessionId({
        metadata: { jobId: "ses_from_meta" },
        content: STARTED_XML,
      }),
    ).toBe("ses_from_meta");
    expect(extractBackgroundTaskSessionId({ content: STARTED_XML })).toBe("ses_child1");
  });
});

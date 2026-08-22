import { afterEach, describe, expect, it } from "vitest";
import { getHostEvents, setHostEventsForTest, type HostEvents } from "../../src/main/app/event-sink";
import { broadcastToRenderer } from "../../src/main/literature/broadcast";
import {
  broadcastExperimentChanged,
  broadcastExperimentRunStarted,
  sendToExperimentRenderers,
} from "../../src/main/experiment/experiment-ui-events";
import { broadcastInteractionChanged } from "../../src/main/interaction/interaction-ui-events";

type Recorded = {
  kind: "broadcast" | "origin";
  channel: string;
  payload: unknown;
};

function recordingSink(recorded: Recorded[]): HostEvents {
  return {
    broadcast(channel, payload) {
      recorded.push({ kind: "broadcast", channel, payload });
    },
    sendToOriginThenBroadcast(channel, payload, origin) {
      if (origin) {
        origin.send(channel, payload);
        recorded.push({ kind: "origin", channel, payload });
      }
      recorded.push({ kind: "broadcast", channel, payload });
    },
  };
}

afterEach(() => {
  setHostEventsForTest(null);
});

describe("HostEvents port (Phase 3 WP-3.1)", () => {
  it("records broadcastToRenderer through the injected sink", () => {
    const recorded: Recorded[] = [];
    setHostEventsForTest(recordingSink(recorded));
    broadcastToRenderer("literature:paperMaterialized", { projectRoot: "/p", paperId: "1" });
    expect(recorded).toEqual([
      {
        kind: "broadcast",
        channel: "literature:paperMaterialized",
        payload: { projectRoot: "/p", paperId: "1" },
      },
    ]);
  });

  it("sends experiment run events origin-first then broadcast", () => {
    const recorded: Recorded[] = [];
    setHostEventsForTest(recordingSink(recorded));
    const originSends: unknown[] = [];
    sendToExperimentRenderers(
      "experiment:runStarted",
      { projectRoot: "/p", experimentId: "e1" },
      { send: (_channel, payload) => originSends.push(payload) },
    );
    expect(originSends).toHaveLength(1);
    expect(recorded.map((row) => row.kind)).toEqual(["origin", "broadcast"]);
    expect(recorded[0]?.channel).toBe("experiment:runStarted");
  });

  it("does not emit experiment:changed without a project root", () => {
    const recorded: Recorded[] = [];
    setHostEventsForTest(recordingSink(recorded));
    broadcastExperimentChanged({ projectRoot: "", reason: "create" });
    expect(recorded).toEqual([]);
  });

  it("broadcasts experiment:changed and interaction:changed on the original channels", () => {
    const recorded: Recorded[] = [];
    setHostEventsForTest(recordingSink(recorded));
    broadcastExperimentChanged({ projectRoot: "/paper", id: "exp-1", reason: "open" });
    broadcastInteractionChanged({ projectRoot: "/paper", id: "fig-1", reason: "write" });
    broadcastExperimentRunStarted({
      id: "exp-1",
      runId: "r1",
      command: "python run.py",
    });
    expect(recorded.map((row) => row.channel)).toEqual([
      "experiment:changed",
      "interaction:changed",
      "experiment:runStarted",
    ]);
  });

  it("lets tests replace getHostEvents()", () => {
    const recorded: Recorded[] = [];
    setHostEventsForTest(recordingSink(recorded));
    getHostEvents().broadcast("fs:fileChanged", { projectRoot: "/p" });
    expect(recorded[0]?.channel).toBe("fs:fileChanged");
  });
});

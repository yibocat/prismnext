import { describe, expect, it } from "vitest";
import { createInteractionNativeTools } from "../../src/main/agent/interaction-native-tools";
import { createImageDescribeNativeTools } from "../../src/main/agent/image-describe-native-tools";
import { createPiLabNativeTools } from "../../src/main/agent/pi-lab-service";
import { createPiNativeTools } from "../../src/main/agent/pi-sdk-runtime";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";
import type { InteractionActionRequest } from "../../src/main/services/interaction-bridge";
import type { ImageDescribeActionRequest } from "../../src/main/services/image-describe-bridge";

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-lab-1",
  tabId: "pi-lab",
  turnId: "turn-1",
  toolCallId: "call-1",
  projectRoot: "/tmp/lab-project",
  permissionMode: "auto",
};

describe("interaction and image-describe native tools", () => {
  it("maps interaction tools without writing bridge request.json", async () => {
    const calls: InteractionActionRequest[] = [];
    const tools = createInteractionNativeTools({
      executeInteractionAction: (req) => {
        calls.push(req);
        return { ok: true, action: req.action };
      },
    });

    expect(tools.map((t) => t.name)).toEqual([
      "interaction-list",
      "interaction-read",
      "interaction-write",
      "interaction-open",
    ]);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    await byName["interaction-list"]!.execute({ kindPrefix: "plot." }, ctx);
    await byName["interaction-read"]!.execute({ id: "fig-1" }, ctx);
    await byName["interaction-write"]!.execute({ spec: { id: "fig-1", title: "T", kind: "figure.static" } as any }, ctx);
    await byName["interaction-open"]!.execute({ id: "fig-1", focus: true }, ctx);

    expect(calls).toEqual([
      {
        action: "list",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        kindPrefix: "plot.",
      },
      {
        action: "read",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        id: "fig-1",
      },
      {
        action: "write",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        spec: { id: "fig-1", title: "T", kind: "figure.static" },
      },
      {
        action: "open",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        id: "fig-1",
        focus: true,
      },
    ]);
  });

  it("maps image-describe without writing bridge request.json", async () => {
    const calls: ImageDescribeActionRequest[] = [];
    const tools = createImageDescribeNativeTools({
      executeImageDescribeAction: async (req) => {
        calls.push(req);
        return { ok: true, description: "plot diagram" };
      },
    });

    expect(tools.map((t) => t.name)).toEqual(["image-describe"]);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    await byName["image-describe"]!.execute({
      path: "figures/loss.png",
      question: "what is the minimum loss?",
    }, ctx);

    expect(calls).toEqual([
      {
        action: "describe",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        imagePath: "figures/loss.png",
        question: "what is the minimum loss?",
      },
    ]);
  });

  it("registers interaction and image-describe in Pi Lab and Pi native catalog", () => {
    const labNames = createPiLabNativeTools().map((t) => t.name);
    expect(labNames).toContain("interaction-list");
    expect(labNames).toContain("interaction-read");
    expect(labNames).toContain("interaction-write");
    expect(labNames).toContain("interaction-open");
    expect(labNames).toContain("image-describe");

    const piNames = createPiNativeTools({
      toolHost: { execute: async () => ({ ok: true }) },
      getContext: () => ctx,
    }).map((t) => t.name);
    expect(piNames).toContain("interaction-list");
    expect(piNames).toContain("interaction-read");
    expect(piNames).toContain("interaction-write");
    expect(piNames).toContain("interaction-open");
    expect(piNames).toContain("image-describe");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelProxyPush } from "../../src/shared/remote";

vi.mock("../../src/main/app/settings", () => ({
  getSettings: () => ({
    aiApiKeys: { anthropic: "sk-test" },
  }),
}));

describe("model gateway stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards two SSE body chunks then end", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: one\n\n"));
        controller.enqueue(encoder.encode("data: two\n\n"));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    })));

    const { runModelProxyStart } = await import("../../src/main/remote/model-gateway");
    const pushed: ModelProxyPush[] = [];
    await runModelProxyStart({
      requestId: "r1",
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }, async (chunk) => {
      pushed.push(chunk);
    });

    expect(pushed[0]).toMatchObject({ kind: "head", status: 200 });
    expect(pushed.filter((item) => item.kind === "body").map((item) => item.text)).toEqual([
      "data: one\n\n",
      "data: two\n\n",
    ]);
    expect(pushed.at(-1)).toMatchObject({ kind: "end" });
    expect(JSON.stringify(pushed)).not.toContain("sk-");
  });
});

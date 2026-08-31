import { describe, expect, it } from "vitest";
import { GATEWAY_PLACEHOLDER_KEY, stripAgentSecrets, stripProxyHeaders } from "../../src/shared/remote";

describe("model gateway strip", () => {
  it("never writes keys into objects that go on the SSH frame", () => {
    const frame = {
      requestId: "r1",
      url: "https://api.anthropic.com/v1/messages",
      headers: stripProxyHeaders({
        "content-type": "application/json",
        "x-api-key": "sk-real",
        Authorization: `Bearer ${GATEWAY_PLACEHOLDER_KEY}`,
      }),
      apiKey: "sk-should-not-survive",
    };
    const safe = stripAgentSecrets(frame);
    const json = JSON.stringify(safe);
    expect(json).not.toContain("sk-real");
    expect(json).not.toContain("sk-should");
    expect(safe.headers).toEqual({ "content-type": "application/json" });
  });
});

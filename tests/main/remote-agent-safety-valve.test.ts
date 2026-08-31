import { describe, expect, it } from "vitest";
import { remoteProfileIdFromAgentArgs } from "../../src/main/remote/agent-route";

describe("remote agent routing valve", () => {
  it("treats a remote:// focus as Host-bound, not a local send", () => {
    expect(remoteProfileIdFromAgentArgs({ projectRoot: "remote://lab/home/ubuntu/paper" })).toBe("lab");
    expect(remoteProfileIdFromAgentArgs({
      projectRoot: "/Users/me/paper",
      boundCheckoutPath: "remote://lab/home/ubuntu/paper",
    })).toBe("lab");
    expect(remoteProfileIdFromAgentArgs({ projectRoot: "/Users/me/paper" })).toBeNull();
  });
});

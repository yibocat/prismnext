import { describe, expect, it } from "vitest";
import { remoteAgentBlocked } from "../../src/main/remote/agent-safety";

describe("remote agent safety valve", () => {
  it("blocks send when the focus is a remote project root", () => {
    expect(remoteAgentBlocked({ projectRoot: "remote://lab/home/ubuntu/paper" })).toBe(true);
    expect(remoteAgentBlocked({
      projectRoot: "/Users/me/paper",
      boundCheckoutPath: "remote://lab/home/ubuntu/paper",
    })).toBe(true);
    expect(remoteAgentBlocked({ projectRoot: "/Users/me/paper" })).toBe(false);
  });
});

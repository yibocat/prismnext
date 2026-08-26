import { describe, expect, it } from "vitest";
import {
  describeModelSeedGate,
  remapHostMissingApiKey,
} from "../../src/shared/remote";

describe("remote model credential contract", () => {
  it("does not reuse the local missing-key code when Host has no keys", () => {
    expect(remapHostMissingApiKey("missing_pi_api_key", "deepseek", [])).toBe(
      "host_model_unconfigured",
    );
  });

  it("names the vendor when Host has other keys", () => {
    expect(remapHostMissingApiKey("missing_pi_api_key", "deepseek", ["anthropic"])).toBe(
      "missing_host_api_key:deepseek",
    );
  });

  it("leaves unrelated send errors alone", () => {
    expect(remapHostMissingApiKey("missing_project", "deepseek", [])).toBe("missing_project");
  });

  it("fails the model gate when Settings has nothing to send", () => {
    expect(describeModelSeedGate({
      mode: "remote",
      seed: { providerIds: [], wrapOk: true },
    })).toEqual({
      ok: false,
      detail: "Settings → Models has no API keys to send to the Host.",
    });
  });

  it("passes the model gate with seeded provider ids", () => {
    expect(describeModelSeedGate({
      mode: "remote",
      seed: { providerIds: ["deepseek"], wrapOk: true },
      hostProviderIds: ["deepseek"],
    }).ok).toBe(true);
  });
});

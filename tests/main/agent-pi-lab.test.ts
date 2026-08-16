import { describe, expect, it } from "vitest";
import {
  PI_LAB_SUPPORTED_PROVIDERS,
  PI_LAB_TAB_ID,
} from "../../src/shared/pi-lab";
import {
  buildPiLabSystemPrompt,
  buildPiLabUserText,
  createPiLabService,
  resolvePiLabAuth,
} from "../../src/main/agent/pi-lab-service";

describe("pi lab auth and prompt assembly", () => {
  it("rejects OpenCode catalog providers instead of remapping them to Pi", () => {
    const result = resolvePiLabAuth({
      settings: {
        aiProvider: "opencode-zen",
        aiModel: "gpt-5.5",
        aiApiKeys: { "opencode-zen": "sk-catalog" },
      },
    });
    expect(result).toEqual({ ok: false, reason: "unsupported_pi_provider:opencode-zen" });
  });

  it("reads the decrypted settings key when the send payload omits apiKey", () => {
    const result = resolvePiLabAuth({
      settings: {
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: " sk-from-settings " },
      },
    });
    expect(result).toEqual({
      ok: true,
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      apiKey: "sk-from-settings",
    });
  });

  it("fails closed when the selected provider has no API key", () => {
    const result = resolvePiLabAuth({
      provider: "openai",
      modelId: "gpt-5",
      settings: { aiApiKeys: { anthropic: "sk-other" } },
    });
    expect(result).toEqual({ ok: false, reason: "missing_pi_api_key" });
  });

  it("accepts DeepSeek BYOK and only blocks OpenCode catalog providers", () => {
    expect(PI_LAB_TAB_ID).toBe("pi-lab");
    expect(PI_LAB_SUPPORTED_PROVIDERS).toContain("deepseek");
    expect(resolvePiLabAuth({
      settings: {
        aiProvider: "deepseek",
        aiModel: "deepseek-v4-flash",
        aiApiKeys: { deepseek: "sk-deepseek" },
      },
    })).toEqual({
      ok: true,
      provider: "deepseek",
      modelId: "deepseek-v4-flash",
      apiKey: "sk-deepseek",
    });
  });

  it("injects the composed PrismNext prompt and keeps project rules on the user turn", () => {
    expect(buildPiLabSystemPrompt({
      stableSystem: "Stable system from PromptManager.",
      agentsMd: "# Project agents",
    })).toContain("Stable system from PromptManager.");
    expect(buildPiLabSystemPrompt({
      stableSystem: "Stable system from PromptManager.",
      agentsMd: "# Project agents",
    })).toContain("# Project agents");

    expect(buildPiLabUserText({
      text: "Search local papers about transformers.",
      projectRules: "Always cite bibkeys.",
    })).toBe("Always cite bibkeys.\n\nSearch local papers about transformers.");
  });
});

describe("pi lab service status", () => {
  it("is not ready without a project or API key and never claims OpenCode chat", async () => {
    const lab = createPiLabService({
      userDataDir: "/tmp/prism-pi-lab-test",
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: {},
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    const missingKey = lab.status("/tmp/project");
    expect(missingKey.ready).toBe(false);
    expect(missingKey.reason).toBe("missing_pi_api_key");
    expect(missingKey.tools).toEqual([
      "literature-search",
      "literature-discover",
      "research-brief-update",
      "experiment-run",
    ]);

    const missingProject = createPiLabService({
      userDataDir: "/tmp/prism-pi-lab-test",
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    }).status();
    expect(missingProject.ready).toBe(false);
    expect(missingProject.reason).toBe("missing_project");

    const send = await lab.send({ projectRoot: "", text: "hello" });
    expect(send).toEqual({ ok: false, error: "missing_project" });
  });
});

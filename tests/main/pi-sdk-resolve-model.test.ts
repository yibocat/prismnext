import { describe, expect, it, vi } from "vitest";
import { resolvePiModelFromRuntime } from "../../src/main/agent/pi-sdk-runtime";

type FakeModel = { id: string; provider: string };

function fakeRuntime(initial: FakeModel[] = []) {
  const models = [...initial];
  return {
    async setRuntimeApiKey() {},
    getModel(providerId: string, modelId: string) {
      return models.find((m) => m.provider === providerId && m.id === modelId);
    },
    refresh: vi.fn(async () => ({ errors: new Map() })),
    seed(model: FakeModel) {
      models.push(model);
    },
  };
}

describe("resolvePiModelFromRuntime", () => {
  it("returns a bundled model without refreshing", async () => {
    const runtime = fakeRuntime([{ provider: "opencode-go", id: "deepseek-v4-flash" }]);
    const model = await resolvePiModelFromRuntime(runtime, {
      providerId: "opencode-go",
      modelId: "deepseek-v4-flash",
      apiKey: "sk-test",
    });
    expect(model.id).toBe("deepseek-v4-flash");
    expect(runtime.refresh).not.toHaveBeenCalled();
  });

  it("refreshes the provider catalog when the model is missing from the bundled snapshot", async () => {
    const runtime = fakeRuntime();
    runtime.refresh.mockImplementation(async () => {
      runtime.seed({
        provider: "opencode-go",
        id: "deepseek-v4-flash-vision-exp",
      });
      return { errors: new Map() };
    });

    const model = await resolvePiModelFromRuntime(runtime, {
      providerId: "opencode-go",
      modelId: "deepseek-v4-flash-vision-exp",
      apiKey: "sk-test",
    });

    expect(model.id).toBe("deepseek-v4-flash-vision-exp");
    expect(runtime.refresh).toHaveBeenCalledWith({
      providers: ["opencode-go"],
      allowNetwork: true,
      force: true,
    });
  });

  it("throws unknown_pi_model when refresh still does not register the model", async () => {
    const runtime = fakeRuntime();
    await expect(
      resolvePiModelFromRuntime(runtime, {
        providerId: "opencode-go",
        modelId: "deepseek-v4-flash-vision-exp",
        apiKey: "sk-test",
      }),
    ).rejects.toThrow("unknown_pi_model:opencode-go/deepseek-v4-flash-vision-exp");
  });
});

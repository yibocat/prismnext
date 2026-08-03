import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyVisionFallbackForSend } from "../../src/renderer/lib/chat/vision-fallback-send";

const visionPhaseTab = { id: "tab-1", preparePhase: null as string | null };

vi.mock("../../src/renderer/lib/providers", async () => {
  const actual = await vi.importActual<typeof import("../../src/renderer/lib/providers")>(
    "../../src/renderer/lib/providers",
  );
  return {
    ...actual,
    prefetchOpenCodeModelsCatalog: vi.fn(async () => ({})),
  };
});

vi.mock("../../src/renderer/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      activeTabId: "tab-1",
      tabs: [visionPhaseTab],
      _setPreparePhase: (tabId: string, phase: string | null) => {
        if (tabId === visionPhaseTab.id) visionPhaseTab.preparePhase = phase;
      },
    }),
  },
}));

vi.mock("../../src/renderer/lib/i18n", () => ({
  i18n: {
    t: (key: string, opts?: { model?: string; message?: string }) => {
      if (key === "chat.visionFallback.describedNote") {
        return `Described via ${opts?.model ?? ""}`;
      }
      if (key === "chat.visionFallback.describeFailed") {
        return `Image description failed: ${opts?.message ?? ""}`;
      }
      return key;
    },
  },
}));

describe("applyVisionFallbackForSend", () => {
  beforeEach(() => {
    visionPhaseTab.preparePhase = null;
    vi.stubGlobal("window", {
      electronAPI: {
        chatDescribeImages: vi.fn(async () => ({
          descriptions: [
            { name: "shot.png", text: "A red error dialog saying compile failed.", cached: false },
          ],
        })),
      },
    });
  });

  it("passes through when there are no images", async () => {
    const out = await applyVisionFallbackForSend({
      promptText: "hello",
      promptImages: [],
      displayBlocks: [],
      settings: { aiProvider: "deepseek", aiModel: "deepseek-v4-flash" } as any,
    });
    expect(out.promptImages).toEqual([]);
    expect(out.promptText).toBe("hello");
    expect(out.note).toBeNull();
    expect(window.electronAPI.chatDescribeImages).not.toHaveBeenCalled();
    expect(visionPhaseTab.preparePhase).toBeNull();
  });

  it("describes images for a text-only main model via the helper", async () => {
    const out = await applyVisionFallbackForSend({
      promptText: "what is this?",
      promptImages: [{ name: "shot.png", mimeType: "image/png", data: "abc" }],
      displayBlocks: [
        {
          type: "text",
          text: "what is this?",
          attachments: [{ kind: "image", name: "shot.png", path: "/tmp/shot.png" }],
        },
      ],
      settings: {
        aiProvider: "deepseek",
        aiModel: "deepseek-v4-flash",
        aiVisionFallbackModel: "opencode-go/minimax-m3",
        aiApiKeys: { "opencode-go": "sk-test" },
        aiCustomProviders: [{ id: "opencode-go", name: "Go", baseUrl: "https://opencode.ai/zen/go" }],
        aiCustomModelsData: {
          deepseek: [
            {
              id: "deepseek-v4-flash",
              name: "DeepSeek V4 Flash",
              contextWindow: "1M",
              capabilities: { vision: false },
            },
          ],
        },
      } as any,
    });

    expect(window.electronAPI.chatDescribeImages).toHaveBeenCalledWith({
      providerId: "opencode-go",
      modelId: "minimax-m3",
      images: [{ name: "shot.png", mimeType: "image/png", data: "abc" }],
    });
    expect(out.promptImages).toEqual([]);
    expect(out.promptText).toContain("Attached images (via vision fallback)");
    expect(out.promptText).toContain("A red error dialog");
    expect(out.promptText).toContain("what is this?");
    expect(out.note).toBe("Described via minimax-m3");
    expect(visionPhaseTab.preparePhase).toBe("waiting_model");
  });

  it("throws a localized key when helper is missing", async () => {
    await expect(
      applyVisionFallbackForSend({
        promptText: "x",
        promptImages: [{ name: "a.png", mimeType: "image/png", data: "x" }],
        displayBlocks: [],
        settings: {
          aiProvider: "deepseek",
          aiModel: "deepseek-v4-flash",
          aiVisionFallbackModel: null,
          aiCustomModelsData: {
            deepseek: [
              {
                id: "deepseek-v4-flash",
                name: "Flash",
                contextWindow: "1M",
                capabilities: { vision: false },
              },
            ],
          },
        } as any,
      }),
    ).rejects.toThrow("chat.visionFallback.helperRequired");
  });

  it("still calls the helper when catalog has not resolved the model row yet", async () => {
    await applyVisionFallbackForSend({
      promptText: "see image",
      promptImages: [{ name: "a.png", mimeType: "image/png", data: "x" }],
      displayBlocks: [],
      settings: {
        aiProvider: "deepseek",
        aiModel: "deepseek-v4-flash",
        aiVisionFallbackModel: "opencode-go/minimax-m3",
        aiApiKeys: { "opencode-go": "sk-test" },
        aiCustomProviders: [{ id: "opencode-go", name: "Go", baseUrl: "https://x" }],
        aiCustomModelsData: {
          deepseek: [
            {
              id: "deepseek-v4-flash",
              name: "Flash",
              contextWindow: "1M",
              capabilities: { vision: false },
            },
          ],
        },
      } as any,
    });
    expect(window.electronAPI.chatDescribeImages).toHaveBeenCalled();
  });

  it("sets describing_images prepare phase while the helper runs", async () => {
    let phaseDuringCall: string | null = null;
    vi.stubGlobal("window", {
      electronAPI: {
        chatDescribeImages: vi.fn(async () => {
          phaseDuringCall = visionPhaseTab.preparePhase;
          return {
            descriptions: [{ name: "a.png", text: "ok", cached: false }],
          };
        }),
      },
    });

    await applyVisionFallbackForSend({
      promptText: "see",
      promptImages: [{ name: "a.png", mimeType: "image/png", data: "x" }],
      displayBlocks: [],
      settings: {
        aiProvider: "deepseek",
        aiModel: "deepseek-v4-flash",
        aiVisionFallbackModel: "opencode-go/minimax-m3",
        aiApiKeys: { "opencode-go": "sk-test" },
        aiCustomProviders: [{ id: "opencode-go", name: "Go", baseUrl: "https://x" }],
        aiCustomModelsData: {
          deepseek: [
            {
              id: "deepseek-v4-flash",
              name: "Flash",
              contextWindow: "1M",
              capabilities: { vision: false },
            },
          ],
        },
      } as any,
    });

    expect(phaseDuringCall).toBe("describing_images");
    expect(visionPhaseTab.preparePhase).toBe("waiting_model");
  });
});

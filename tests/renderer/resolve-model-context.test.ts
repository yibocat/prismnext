import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/lib/providers/opencode-catalog-models", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/renderer/lib/providers/opencode-catalog-models")
  >("../../src/renderer/lib/providers/opencode-catalog-models");
  return {
    ...actual,
    getCachedOpenCodeCatalogModels: vi.fn(),
  };
});

import {
  getCachedOpenCodeCatalogModels,
  isUnknownContextWindowLabel,
} from "../../src/renderer/lib/providers/opencode-catalog-models";
import { resolveSelectedModelContextTokens } from "../../src/renderer/lib/providers/index";

describe("isUnknownContextWindowLabel", () => {
  it("treats Unknown / em dash as unknown", () => {
    expect(isUnknownContextWindowLabel("Unknown")).toBe(true);
    expect(isUnknownContextWindowLabel("—")).toBe(true);
    expect(isUnknownContextWindowLabel("200K")).toBe(false);
  });
});

describe("resolveSelectedModelContextTokens", () => {
  beforeEach(() => {
    vi.mocked(getCachedOpenCodeCatalogModels).mockReset();
  });

  it("falls back to OpenCode catalog when enabled model has Unknown context", () => {
    vi.mocked(getCachedOpenCodeCatalogModels).mockReturnValue([
      {
        id: "gpt-5.4",
        name: "GPT 5.4",
        contextWindow: "1M",
        capabilities: { vision: false },
      },
    ]);

    const tokens = resolveSelectedModelContextTokens(
      "opencode-go",
      "gpt-5.4",
      { "opencode-go": ["gpt-5.4"] },
      {},
      [{ id: "opencode-go", name: "OpenCode Go", baseUrl: "" }],
    );
    expect(tokens).toBe(1_000_000);
  });
});

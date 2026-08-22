import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settingsState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("electron", () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), "prism-img-describe-userdata"),
  },
}));

vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
  },
}));

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => settingsState.current,
}));

vi.mock("../../src/main/app/logger", () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { imageDescribeTool } from "../../src/main/agent/tools/system";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const tempDirs: string[] = [];

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "img-describe-proj-"));
  tempDirs.push(root);
  return root;
}

function writePng(projectRoot: string, rel = "results/loss.png"): string {
  const abs = path.join(projectRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(PNG_B64, "base64"));
  return rel;
}

function toolCtx(projectRoot: string): ToolExecuteContext {
  return {
    runtimeSessionId: "s1",
    tabId: "s1",
    turnId: "turn-1",
    toolCallId: "tc-1",
    projectRoot,
    permissionMode: "ask",
  };
}

function stubFetchOk(text = "A tiny red dot on white.") {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  settingsState.current = {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("imageDescribeTool", () => {
  it("rejects paths that escape the project root (relative traversal)", async () => {
    settingsState.current = {
      aiVisionFallbackModel: "openai/gpt-4o",
      aiApiKeys: { openai: "sk-test" },
    };
    const projectRoot = makeProject();
    const result = await imageDescribeTool.execute(
      { imagePath: "../outside.png" },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("escapes the project root");
  });

  it("rejects absolute paths outside the project root", async () => {
    settingsState.current = {
      aiVisionFallbackModel: "openai/gpt-4o",
      aiApiKeys: { openai: "sk-test" },
    };
    const projectRoot = makeProject();
    const outsideDir = makeProject();
    const outsideAbs = path.join(outsideDir, "secret.png");
    fs.writeFileSync(outsideAbs, Buffer.from(PNG_B64, "base64"));
    const result = await imageDescribeTool.execute(
      { imagePath: outsideAbs },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("escapes the project root");
  });

  it("returns an actionable error when no multimodal helper is configured", async () => {
    const projectRoot = makeProject();
    const rel = writePng(projectRoot);
    const result = await imageDescribeTool.execute(
      { imagePath: rel },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("Multimodal helper");
    expect(String(result.error)).toContain("Settings");
  });

  it("rejects non-image extensions", async () => {
    settingsState.current = {
      aiVisionFallbackModel: "openai/gpt-4o",
      aiApiKeys: { openai: "sk-test" },
    };
    const projectRoot = makeProject();
    fs.writeFileSync(path.join(projectRoot, "notes.txt"), "hello", "utf-8");
    const result = await imageDescribeTool.execute(
      { imagePath: "notes.txt" },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("Unsupported image type");
  });

  it("rejects images over the byte cap", async () => {
    settingsState.current = {
      aiVisionFallbackModel: "openai/gpt-4o",
      aiApiKeys: { openai: "sk-test" },
    };
    const projectRoot = makeProject();
    fs.mkdirSync(path.join(projectRoot, "results"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "results/big.png"),
      Buffer.alloc(MAX_IMAGE_BYTES + 1, 1),
    );
    const result = await imageDescribeTool.execute(
      { imagePath: "results/big.png" },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("too large");
  });

  it("describes an in-project image via the configured helper (settings → credentials)", async () => {
    settingsState.current = {
      aiVisionFallbackModel: "openai/gpt-4o",
      aiApiKeys: { openai: "sk-test" },
    };
    const fetchMock = stubFetchOk();
    const projectRoot = makeProject();
    const rel = writePng(projectRoot);
    const result = await imageDescribeTool.execute(
      { imagePath: rel, question: "which curve converges fastest?" },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.description).toBe("A tiny red dot on white.");
    expect(result.imagePath).toBe("results/loss.png");
    expect(result.helperModel).toBe("openai/gpt-4o");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
    };
    expect(body.model).toBe("gpt-4o");
    const parts = body.messages[0].content;
    expect(parts[0].text).toContain("which curve converges fastest?");
    expect(parts[1].image_url?.url).toBe(`data:image/png;base64,${PNG_B64}`);
  });

  it("uses the custom provider baseUrl from settings", async () => {
    settingsState.current = {
      aiVisionFallbackModel: "myprovider/some-vision-model",
      aiApiKeys: { myprovider: "sk-custom" },
      aiCustomProviders: [{ id: "myprovider", name: "Mine", baseUrl: "https://llm.example.com/v1" }],
    };
    const fetchMock = stubFetchOk("custom description");
    const projectRoot = makeProject();
    const rel = writePng(projectRoot, "fig.png");
    const result = await imageDescribeTool.execute(
      { imagePath: rel },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.description).toBe("custom description");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-custom");
  });
});

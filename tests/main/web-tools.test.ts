import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";
import { getToolPermissionEntry } from "../../src/shared/permissions/tool-registry";

const readTavilyApiKey = vi.hoisted(() => vi.fn(async () => ""));
const tavilySearch = vi.hoisted(() => vi.fn());
const tavilyExtract = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/lib/tavily/settings", () => ({
  readTavilyApiKey,
}));

vi.mock("../../src/main/lib/tavily/client", () => ({
  tavilySearch,
  tavilyExtract,
}));

import { getNativeToolByName } from "../../src/main/agent/tools/index";

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-web",
  tabId: "tab",
  turnId: "turn",
  toolCallId: "call-web",
  projectRoot: "/tmp/web-tools",
  permissionMode: "auto",
};

describe("native web tools", () => {
  beforeEach(() => {
    readTavilyApiKey.mockReset();
    tavilySearch.mockReset();
    tavilyExtract.mockReset();
  });

  it("is registered as websearch / webfetch with network read-only permissions", () => {
    expect(getNativeToolByName(TOOL_NAMES.websearch)?.name).toBe("websearch");
    expect(getNativeToolByName(TOOL_NAMES.webfetch)?.name).toBe("webfetch");
    expect(getToolPermissionEntry("websearch")?.permissionGroup).toBe("network");
    expect(getToolPermissionEntry("webfetch")?.permissionGroup).toBe("network");
  });

  it("returns missing_tavily_api_key when the user has not set a key", async () => {
    readTavilyApiKey.mockResolvedValue("");
    const search = getNativeToolByName(TOOL_NAMES.websearch)!;
    const result = await search.execute({ query: "tavily pricing" }, ctx) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing_tavily_api_key");
    expect(tavilySearch).not.toHaveBeenCalled();
  });

  it("calls Tavily search with basic depth and the user query", async () => {
    readTavilyApiKey.mockResolvedValue("tvly-test");
    tavilySearch.mockResolvedValue({
      ok: true,
      query: "tavily pricing",
      provider: "tavily",
      results: [{ title: "Pricing", url: "https://tavily.com/pricing", snippet: "credits" }],
      answer: null,
    });
    const search = getNativeToolByName(TOOL_NAMES.websearch)!;
    const result = await search.execute({ query: "tavily pricing", maxResults: 5 }, ctx);
    expect(tavilySearch).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "tvly-test",
      query: "tavily pricing",
      maxResults: 5,
      topic: "general",
    }));
    expect(result).toMatchObject({ ok: true, provider: "tavily" });
  });

  it("calls Tavily extract for webfetch", async () => {
    readTavilyApiKey.mockResolvedValue("tvly-test");
    tavilyExtract.mockResolvedValue({
      ok: true,
      url: "https://example.com",
      format: "markdown",
      content: "# Hello",
      contentLength: 7,
    });
    const fetch = getNativeToolByName(TOOL_NAMES.webfetch)!;
    const result = await fetch.execute({ url: "https://example.com" }, ctx);
    expect(tavilyExtract).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "tvly-test",
      url: "https://example.com",
      format: "markdown",
      extractDepth: "basic",
    }));
    expect(result).toMatchObject({ ok: true, content: "# Hello" });
  });
});

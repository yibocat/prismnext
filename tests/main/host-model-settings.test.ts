import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import {
  mergeHostModelSettings,
  readHostModelSettings,
  resetHostModelSettingsForTests,
} from "../../src/host/model-settings";
import { GATEWAY_PLACEHOLDER_KEY } from "../../src/shared/remote";
import { HOME_HOST_MODEL_FILENAME } from "../../src/shared/workbench/paths";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

const wrapKey = randomBytes(32).toString("base64");

describe("host model settings", () => {
  afterEach(() => {
    resetHostModelSettingsForTests();
    setWorkbenchUserHomeOverride(null);
  });

  it("writes AES-256-GCM ciphertext and keeps plaintext only in memory", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-model-"));
    setWorkbenchUserHomeOverride(home);
    mergeHostModelSettings({
      aiApiKeys: {
        anthropic: "sk-live",
        openai: GATEWAY_PLACEHOLDER_KEY,
      },
      aiBaseUrls: { custom: "https://llm.example.edu/v1" },
    }, wrapKey);
    expect(readHostModelSettings().aiApiKeys).toEqual({ anthropic: "sk-live" });
    const path = join(home, ".prismnext", HOME_HOST_MODEL_FILENAME);
    const disk = readFileSync(path, "utf8");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(disk).not.toContain("sk-live");
    expect(disk).not.toContain(GATEWAY_PLACEHOLDER_KEY);
    expect(JSON.parse(disk)).toMatchObject({ version: 1, alg: "aes-256-gcm" });
  });

  it("does not write plaintext when the wrap key is missing", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-mem-"));
    setWorkbenchUserHomeOverride(home);
    mergeHostModelSettings({ aiApiKeys: { anthropic: "sk-memory-only" } });
    expect(readHostModelSettings().aiApiKeys).toEqual({ anthropic: "sk-memory-only" });
    expect(() => readFileSync(join(home, ".prismnext", HOME_HOST_MODEL_FILENAME), "utf8")).toThrow();
  });

  it("reopens an envelope with the same wrap key", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-reopen-"));
    setWorkbenchUserHomeOverride(home);
    mergeHostModelSettings({ aiApiKeys: { anthropic: "sk-live" } }, wrapKey);
    resetHostModelSettingsForTests();
    expect(readHostModelSettings().aiApiKeys).toBeUndefined();
    mergeHostModelSettings({}, wrapKey);
    expect(readHostModelSettings().aiApiKeys).toEqual({ anthropic: "sk-live" });
  });

  it("writes an envelope from host.configure", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-cfg-"));
    setWorkbenchUserHomeOverride(home);
    const ctx = createHostContext();
    const result = await dispatchHostMethod("host.configure", {
      modelKeys: "remote",
      aiApiKeys: { anthropic: "sk-from-laptop" },
      wrapKey,
    }, ctx);
    expect(result).toEqual({
      ok: true,
      modelKeys: "remote",
      providerIds: ["anthropic"],
      wrapOk: true,
      persisted: true,
    });
    expect(readHostModelSettings().aiApiKeys).toEqual({ anthropic: "sk-from-laptop" });
    expect(readFileSync(join(home, ".prismnext", HOME_HOST_MODEL_FILENAME), "utf8")).not.toContain("sk-from-laptop");
  });

  it("persists tavilyApiKey in the envelope without plaintext", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-tavily-"));
    setWorkbenchUserHomeOverride(home);
    mergeHostModelSettings({ tavilyApiKey: "tvly-host-secret" }, wrapKey);
    expect(readHostModelSettings().tavilyApiKey).toBe("tvly-host-secret");
    const path = join(home, ".prismnext", HOME_HOST_MODEL_FILENAME);
    expect(readFileSync(path, "utf8")).not.toContain("tvly-host-secret");
    resetHostModelSettingsForTests();
    expect(readHostModelSettings().tavilyApiKey).toBeUndefined();
    mergeHostModelSettings({}, wrapKey);
    expect(readHostModelSettings().tavilyApiKey).toBe("tvly-host-secret");
  });
});

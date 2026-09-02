import { describe, expect, it, vi } from "vitest";

const storeCtl = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
}));

vi.mock("electron-store", () => ({
  default: class MockStore {
    get store() {
      return storeCtl.data;
    }
    get(key: string) {
      return storeCtl.data[key];
    }
    set(patch: Record<string, unknown>) {
      Object.assign(storeCtl.data, patch);
    }
    delete(key: string) {
      delete storeCtl.data[key];
    }
  },
}));

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, "utf8"),
    decryptString: (b: Buffer) => b.toString("utf8"),
  },
}));

import {
  getSettings,
  isSensitiveSettingsKey,
  updateSettings,
} from "../../src/main/app/settings";

describe("tavilyApiKey settings", () => {
  it("treats tavilyApiKey as a sensitive field", () => {
    expect(isSensitiveSettingsKey("tavilyApiKey")).toBe(true);
    expect(isSensitiveSettingsKey("theme")).toBe(false);
  });

  it("round-trips the Tavily key through get/update settings", () => {
    storeCtl.data = {};
    updateSettings({ tavilyApiKey: "tvly-test-key" });
    expect(getSettings().tavilyApiKey).toBe("tvly-test-key");
  });
});

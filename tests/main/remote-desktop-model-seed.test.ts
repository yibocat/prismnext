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

import { readDesktopModelSeed, updateSettings } from "../../src/main/app/settings";

describe("desktop model seed for Host", () => {
  it("reads Settings keys through a static import, not a sibling require", () => {
    storeCtl.data = {};
    updateSettings({
      aiApiKeys: { deepseek: "sk-test" },
      aiBaseUrls: { deepseek: "https://api.deepseek.com" },
    });
    const seed = readDesktopModelSeed();
    expect(seed.error).toBeUndefined();
    expect(seed.providerIds).toEqual(["deepseek"]);
    expect(seed.aiApiKeys.deepseek).toBe("sk-test");
    expect(seed.wrapOk).toBe(true);
    expect(seed.wrapKey.length).toBeGreaterThan(0);
  });
});

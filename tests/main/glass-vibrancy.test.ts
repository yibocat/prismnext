import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn(() => ({
  theme: "dark" as const,
  _themeConfig: { glassEffect: false },
}));

vi.mock("electron", () => ({
  nativeTheme: { shouldUseDarkColors: true },
  BrowserWindow: class {},
}));

vi.mock("../../src/main/app/settings", () => ({
  getSettings: () => getSettings(),
}));

import {
  applyNativeGlass,
  opaqueWindowBackgroundFromSettings,
  readPersistedGlassEffect,
} from "../../src/main/app/glass-vibrancy";

function fakeWin() {
  return {
    isDestroyed: () => false,
    setVibrancy: vi.fn(),
    setBackgroundMaterial: vi.fn(),
    setBackgroundColor: vi.fn(),
    invalidateShadow: vi.fn(),
  };
}

describe("readPersistedGlassEffect", () => {
  it("defaults to off", () => {
    getSettings.mockReturnValue({ theme: "dark", _themeConfig: {} });
    expect(readPersistedGlassEffect()).toBe(false);
  });

  it("reads _themeConfig.glassEffect", () => {
    getSettings.mockReturnValue({
      theme: "dark",
      _themeConfig: { glassEffect: true },
    });
    expect(readPersistedGlassEffect()).toBe(true);
  });
});

describe("opaqueWindowBackgroundFromSettings", () => {
  it("uses the dark fill when theme is dark", () => {
    getSettings.mockReturnValue({ theme: "dark", _themeConfig: {} });
    expect(opaqueWindowBackgroundFromSettings()).toBe("#2c2c2c");
  });

  it("uses white when theme is light", () => {
    getSettings.mockReturnValue({ theme: "light", _themeConfig: {} });
    expect(opaqueWindowBackgroundFromSettings()).toBe("#ffffff");
  });
});

describe("applyNativeGlass", () => {
  beforeEach(() => {
    getSettings.mockReturnValue({ theme: "dark", _themeConfig: { glassEffect: false } });
  });

  it("turns vibrancy off and paints an opaque fill", () => {
    const win = fakeWin();
    applyNativeGlass(win as never, { enabled: false, opaqueBackground: "#112233" });
    if (process.platform === "darwin") {
      expect(win.setVibrancy).toHaveBeenCalledWith(null);
      expect(win.setBackgroundColor).toHaveBeenCalledWith("#112233");
      expect(win.invalidateShadow).toHaveBeenCalled();
    } else if (process.platform === "win32") {
      expect(win.setBackgroundMaterial).toHaveBeenCalledWith("none");
      expect(win.setBackgroundColor).toHaveBeenCalledWith("#112233");
    } else {
      expect(win.setBackgroundColor).toHaveBeenCalledWith("#112233");
    }
  });

  it("enables Electron 43 chrome material when on", () => {
    const win = fakeWin();
    applyNativeGlass(win as never, { enabled: true });
    if (process.platform === "darwin") {
      expect(win.setBackgroundColor).toHaveBeenCalledWith("#00000000");
      expect(win.setVibrancy).toHaveBeenCalledWith("sidebar");
    } else if (process.platform === "win32") {
      expect(win.setBackgroundColor).toHaveBeenCalledWith("#00000000");
      expect(win.setBackgroundMaterial).toHaveBeenCalledWith("mica");
    } else {
      expect(win.setBackgroundColor).toHaveBeenCalledWith("#00000000");
    }
  });
});

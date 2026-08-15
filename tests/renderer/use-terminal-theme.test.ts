import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useTheme = vi.fn(() => ({ resolvedTheme: "dark" as string | undefined }));

vi.mock("next-themes", () => ({
  useTheme: () => useTheme(),
}));

import { useTerminalTheme } from "../../src/renderer/hooks/use-terminal-theme";

describe("useTerminalTheme", () => {
  it("keeps the xterm canvas transparent so the content surface shows through", () => {
    useTheme.mockReturnValue({ resolvedTheme: "dark" });
    const { result } = renderHook(() => useTerminalTheme());
    expect(result.current.background).toBe("#00000000");
    expect(result.current.cursorAccent).toBe("#00000000");
  });

  it("uses the light ANSI palette without painting an opaque background", () => {
    useTheme.mockReturnValue({ resolvedTheme: "light" });
    const { result } = renderHook(() => useTerminalTheme());
    expect(result.current.background).toBe("#00000000");
    expect(result.current.foreground).toBe("#1a1a1a");
  });
});

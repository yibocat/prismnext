import { useMemo, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useSettingsStore } from "@/stores/settings-store";
import type { ITheme } from "@xterm/xterm";

// ─── VS Code Light+ inspired ───

const LIGHT_THEME: ITheme = {
  foreground: "#1a1a1a",
  background: "#f8f8f8", // fallback — overridden by theme CSS variable below
  cursor: "#1a1a1a",
  cursorAccent: "#ffffff",
  selectionBackground: "#0066cc40",
  selectionForeground: "#1a1a1a",
  black: "#000000",
  red: "#c41a16",
  green: "#007400",
  yellow: "#9c6500",
  blue: "#0451a5",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#a0a0a0",
  brightBlack: "#666666",
  brightRed: "#c41a16",
  brightGreen: "#007400",
  brightYellow: "#9c6500",
  brightBlue: "#0451a5",
  brightMagenta: "#a626a4",
  brightCyan: "#0184bc",
  brightWhite: "#1a1a1a",
};

// ─── VS Code Dark+ inspired ───

const DARK_THEME: ITheme = {
  foreground: "#d4d4d4",
  background: "#1e1e2a", // fallback — overridden by theme CSS variable below
  cursor: "#d4d4d4",
  cursorAccent: "#1e1e2a",
  selectionBackground: "#264f7840",
  selectionForeground: "#d4d4d4",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#0dbc79",
  brightYellow: "#e5e510",
  brightBlue: "#2472c8",
  brightMagenta: "#bc3fbc",
  brightCyan: "#11a8cd",
  brightWhite: "#e5e5e5",
};

// ─── Helpers ───

/** Read a CSS variable from <html> and return its value */
function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Convert an oklch CSS color string to an rgba hex via canvas pixel sampling */
function oklchToHex(oklch: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = oklch;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  // Return as hex (no alpha — xterm doesn't need it for background)
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

// ─── Hook ───

export function useTerminalTheme(): ITheme {
  const { resolvedTheme } = useTheme();
  const themeColor = useSettingsStore((s) => s.settings.themeColor);
  const [backgroundHex, setBackgroundHex] = useState("#1e1e2a");

  useEffect(() => {
    // Delay one frame so the theme CSS variables are applied before we read them.
    // next-themes may apply the .dark class asynchronously, so reading immediately
    // could give the stale value from the previous mode.
    const raf = requestAnimationFrame(() => {
      const bg = getCSSVar("--background");
      if (bg) {
        try {
          setBackgroundHex(oklchToHex(bg));
        } catch {
          // keep fallback
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [resolvedTheme, themeColor]);

  return useMemo(() => {
    const base = resolvedTheme === "light" ? LIGHT_THEME : DARK_THEME;
    return { ...base, background: backgroundHex };
  }, [resolvedTheme, backgroundHex]);
}

import { useMemo } from "react";
import { useTheme } from "next-themes";
import type { ITheme } from "@xterm/xterm";

// ─── VS Code Light+ inspired ───

const LIGHT_THEME: ITheme = {
  foreground: "#1a1a1a",
  background: "#ffffff",
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
  background: "#1e1e1e",
  cursor: "#d4d4d4",
  cursorAccent: "#1e1e1e",
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

// ─── Hook ───

export function useTerminalTheme(): ITheme {
  const { resolvedTheme } = useTheme();
  return useMemo(
    () => (resolvedTheme === "light" ? LIGHT_THEME : DARK_THEME),
    [resolvedTheme],
  );
}

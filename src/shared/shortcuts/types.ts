export type ShortcutPlatform = "darwin" | "win32" | "linux";

export type ShortcutScope = "app" | "right-area" | "chat" | "editor";

export type ShortcutCategory = "shell" | "editor" | "workspace" | "product";

/** Platform-primary modifier: Meta on macOS, Ctrl on Windows/Linux. */
export type ShortcutChord = {
  key: string;
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Absolute Control (even on macOS), e.g. Ctrl+Tab. */
  ctrl?: boolean;
  /** Absolute Meta; prefer primary. */
  meta?: boolean;
};

export type ShortcutDef = {
  id: string;
  category: ShortcutCategory;
  remappable: boolean;
  scope: ShortcutScope;
  defaultChord: ShortcutChord;
  /** i18n key — action label only (no chord). */
  labelKey: string;
  menuAccelerator?: boolean;
  /** false = documented / Settings only; handler not wired yet. */
  implemented?: boolean;
};

export type ShortcutOverrides = Record<string, ShortcutChord>;

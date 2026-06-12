// lib/theme/font-options.ts
// Built-in font options for Appearance settings.
// All families include Chinese fallback chain.

export interface FontOption {
  id: string;
  label: string;
  family: string;       // CSS font-family value
  category: "sans" | "mono";
}

const CN = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';
const CN_MONO = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", ui-monospace, monospace';

export const SANS_FONTS: FontOption[] = [
  {
    id: "geist-sans",
    label: "Geist Sans",
    family: `"Geist Sans", ${CN}`,
    category: "sans",
  },
  {
    id: "inter",
    label: "Inter",
    family: `"Inter", ${CN}`,
    category: "sans",
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    family: `"IBM Plex Sans", ${CN}`,
    category: "sans",
  },
  {
    id: "source-sans-3",
    label: "Source Sans 3",
    family: `"Source Sans 3", ${CN}`,
    category: "sans",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    family: `"DM Sans", ${CN}`,
    category: "sans",
  },
  {
    id: "plus-jakarta-sans",
    label: "Plus Jakarta Sans",
    family: `"Plus Jakarta Sans", ${CN}`,
    category: "sans",
  },
];

export const MONO_FONTS: FontOption[] = [
  {
    id: "cascadia-code",
    label: "Cascadia Code",
    family: `"Cascadia Code", ${CN_MONO}`,
    category: "mono",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    family: `"JetBrains Mono", ${CN_MONO}`,
    category: "mono",
  },
  {
    id: "fira-code",
    label: "Fira Code",
    family: `"Fira Code", ${CN_MONO}`,
    category: "mono",
  },
  {
    id: "sf-mono",
    label: "SF Mono",
    family: `"SF Mono", "SF Mono SC", ${CN_MONO}`,
    category: "mono",
  },
  {
    id: "consolas",
    label: "Consolas",
    family: `"Consolas", "Courier New", ${CN_MONO}`,
    category: "mono",
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    family: `"IBM Plex Mono", ${CN_MONO}`,
    category: "mono",
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    family: `"Source Code Pro", ${CN_MONO}`,
    category: "mono",
  },
];

export function getFontById(id: string): FontOption | undefined {
  return [...SANS_FONTS, ...MONO_FONTS].find((f) => f.id === id);
}

export function getDefaultSansFont(): FontOption {
  return SANS_FONTS[0]; // Geist Sans
}

export function getDefaultMonoFont(): FontOption {
  return MONO_FONTS[0]; // Geist Mono
}

// lib/theme/primary-colors.ts
// Predefined primary color options. Each has a label, light + dark oklch values,
// ring colors for both modes, and an OKLCH hue angle for the two-dimensional color system.

export interface PrimaryColorDef {
  id: string;
  label: string;
  hue: number;                // OKLCH hue angle
  primaryLight: string;        // oklch for :root
  primaryLightForeground: string;
  primaryDark: string;         // oklch for .dark
  primaryDarkForeground: string;
  ringLight: string;
  ringDark: string;
}

export const PRIMARY_COLORS: PrimaryColorDef[] = [
  {
    id: "blue",
    label: "Sapphire",
    hue: 250,
    primaryLight: "oklch(0.55 0.18 250)",
    primaryLightForeground: "oklch(0.985 0 0)",
    primaryDark: "oklch(0.65 0.18 250)",
    primaryDarkForeground: "oklch(0.15 0.02 250)",
    ringLight: "oklch(0.55 0.22 250)",
    ringDark: "oklch(0.65 0.22 250)",
  },
  {
    id: "violet",
    label: "Amethyst",
    hue: 280,
    primaryLight: "oklch(0.50 0.18 280)",
    primaryLightForeground: "oklch(0.985 0 0)",
    primaryDark: "oklch(0.62 0.18 280)",
    primaryDarkForeground: "oklch(0.15 0.02 280)",
    ringLight: "oklch(0.50 0.22 280)",
    ringDark: "oklch(0.62 0.22 280)",
  },
  {
    id: "teal",
    label: "Seafoam",
    hue: 185,
    primaryLight: "oklch(0.50 0.14 185)",
    primaryLightForeground: "oklch(0.985 0 0)",
    primaryDark: "oklch(0.62 0.14 185)",
    primaryDarkForeground: "oklch(0.15 0.02 185)",
    ringLight: "oklch(0.50 0.18 185)",
    ringDark: "oklch(0.62 0.18 185)",
  },
  {
    id: "green",
    label: "Emerald",
    hue: 160,
    primaryLight: "oklch(0.53 0.16 160)",
    primaryLightForeground: "oklch(0.985 0 0)",
    primaryDark: "oklch(0.63 0.16 160)",
    primaryDarkForeground: "oklch(0.15 0.02 160)",
    ringLight: "oklch(0.53 0.20 160)",
    ringDark: "oklch(0.63 0.20 160)",
  },
  {
    id: "amber",
    label: "Marigold",
    hue: 85,
    primaryLight: "oklch(0.55 0.18 85)",
    primaryLightForeground: "oklch(0.15 0.02 85)",
    primaryDark: "oklch(0.68 0.16 85)",
    primaryDarkForeground: "oklch(0.15 0.02 85)",
    ringLight: "oklch(0.55 0.22 85)",
    ringDark: "oklch(0.68 0.20 85)",
  },
  {
    id: "rose",
    label: "Crimson",
    hue: 10,
    primaryLight: "oklch(0.52 0.18 10)",
    primaryLightForeground: "oklch(0.985 0 0)",
    primaryDark: "oklch(0.64 0.16 10)",
    primaryDarkForeground: "oklch(0.15 0.02 10)",
    ringLight: "oklch(0.52 0.22 10)",
    ringDark: "oklch(0.64 0.20 10)",
  },
  {
    id: "mono",
    label: "Graphite",
    hue: 0,
    primaryLight: "oklch(0.3 0 0)",
    primaryLightForeground: "oklch(0.985 0 0)",
    primaryDark: "oklch(0.8 0 0)",
    primaryDarkForeground: "oklch(0.15 0 0)",
    ringLight: "oklch(0.5 0 0)",
    ringDark: "oklch(0.65 0 0)",
  },
];

export function getPrimaryByHue(hue: number): PrimaryColorDef {
  // Find closest color family
  let closest = PRIMARY_COLORS[0];
  let minDist = Infinity;
  for (const p of PRIMARY_COLORS) {
    const dist = Math.abs(p.hue - hue);
    if (dist < minDist) { minDist = dist; closest = p; }
  }
  return closest;
}

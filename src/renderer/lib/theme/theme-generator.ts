// lib/theme/theme-generator.ts
// Core engine: ThemeConfig → CSS text string for <style> injection.

import { generateNeutralVars, DEFAULT_INTENSITY } from "./color-palettes";
import { PRIMARY_COLORS, type PrimaryColorDef } from "./primary-colors";
import { CHART_PALETTES, type ChartSchemeId } from "./chart-palettes";
import { getFontById, getDefaultSansFont, getDefaultMonoFont } from "./font-options";
import { generateGlassCSS, type GlassTier } from "./glass-system";

export interface ThemeConfig {
  baseIntensity: number;  // 0-1, replaces baseColor
  primaryColor: string;
  radius: number;
  fontSans: string;
  fontMono: string;
  uiFontSize: string;
  editorFontFamily: string;
  editorFontSize: string;
  chartScheme?: ChartSchemeId;
  glassEffect: boolean;
  glassIntensity: GlassTier;
}

export function getDefaultThemeConfig(): ThemeConfig {
  return {
    baseIntensity: DEFAULT_INTENSITY,  // 25% default
    primaryColor: "blue",
    radius: 0.525,
    fontSans: "system-ui",
    fontMono: "system-mono",
    uiFontSize: "16px",
    editorFontFamily: "system-mono",
    editorFontSize: "13px",
    glassEffect: false,
    glassIntensity: 3 as GlassTier,
  };
}

function resolvePrimary(config: ThemeConfig): PrimaryColorDef {
  const preset = PRIMARY_COLORS.find((p) => p.id === config.primaryColor);
  if (preset) return preset;
  return PRIMARY_COLORS[0]; // fallback to blue
}

function buildSidebarVars(
  vars: Record<string, string>,
  mode: "light" | "dark"
): string {
  return `
  --sidebar: ${vars["--sidebar"]};
  --sidebar-foreground: ${vars["--sidebar-foreground"]};
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: ${vars["--sidebar-accent"]};
  --sidebar-accent-foreground: ${vars["--sidebar-accent-foreground"]};
  --sidebar-border: ${vars["--sidebar-border"]};
  --sidebar-ring: ${vars["--sidebar-ring"]};`;
}

function resolveFontSize(v: string): string {
  // Direct px values ("13px"–"18px"), or legacy ids ("small"/"medium"/"large")
  if (v.endsWith("px")) return v;
  const legacy: Record<string, string> = { small: "14px", medium: "16px", large: "18px" };
  return legacy[v] ?? "15px";
}

function generateEditorSyntaxVars(
  primary: PrimaryColorDef,
  neutralVars: Record<string, string>,
  mode: "light" | "dark"
): string {
  const editorBg = neutralVars["--background"];
  const editorFg = neutralVars["--foreground"];
  const editorGutterBg = neutralVars["--background"];  // same as editor bg — seamless
  const editorGutterFg = neutralVars["--muted-foreground"];
  const editorActiveLine = neutralVars["--accent"];
  const primaryColor = mode === "light" ? primary.primaryLight : primary.primaryDark;

  // In dark mode, syntax colors should be brighter (higher lightness).
  // In light mode, they should be darker (lower lightness).
  const L = mode === "dark" ? 0.72 : 0.42;
  const Lcomment = mode === "dark" ? 0.50 : 0.55;

  // Use fixed semantic hues — NOT derived from primary hue.
  // Only keyword/tag use the primary brand color.
  return `
  /* Editor chrome */
  --editor-bg: ${editorBg};
  --editor-fg: ${editorFg};
  --editor-gutter-bg: ${editorGutterBg};
  --editor-gutter-fg: ${editorGutterFg};
  --editor-selection: ${primaryColor}26;
  --editor-active-line: ${editorActiveLine};
  --editor-cursor: ${primaryColor};

  /* Diff colors — unified across all themes */
  --editor-diff-deleted-bg: ${mode === "dark" ? "rgba(248,81,81,0.12)" : "rgba(239,68,68,0.10)"};
  --editor-diff-inserted-bg: ${mode === "dark" ? "rgba(52,211,110,0.12)" : "rgba(34,197,94,0.10)"};
  --editor-diff-deleted-text: ${mode === "dark" ? "rgba(248,81,81,0.18)" : "rgba(239,68,68,0.15)"};
  --editor-diff-inserted-text: ${mode === "dark" ? "rgba(52,211,110,0.18)" : "rgba(34,197,94,0.15)"};

  /* Syntax token colors — Prism custom theme
     Semantic hues: keyword=brand, string=green, number=amber,
     function=blue, type=teal, regexp=rose, comment=gray */
  --syntax-keyword: ${primaryColor};
  --syntax-comment: oklch(${Lcomment} 0.03 270);
  --syntax-string: oklch(${L} 0.14 155);
  --syntax-number: oklch(${L} 0.16 75);
  --syntax-function: oklch(${L} 0.14 250);
  --syntax-type: oklch(${L} 0.14 190);
  --syntax-tag: ${primaryColor};
  --syntax-operator: oklch(${L} 0.04 270);
  --syntax-regexp: oklch(${L} 0.16 20);
  --syntax-bracket: ${editorFg}80;
  --syntax-variable: ${editorFg};
  --syntax-label: oklch(${L} 0.12 280);
  --syntax-literal: oklch(${L} 0.14 75);
  --syntax-emphasis: ${editorFg};
  --syntax-strong: ${editorFg};
  --syntax-link: oklch(${L} 0.14 250);`;
}

export function generateThemeCSS(config: ThemeConfig): string {
  const primary = resolvePrimary(config);
  const { light: lightVars, dark: darkVars } = generateNeutralVars(config.baseIntensity, primary.hue);
  const chart = CHART_PALETTES[config.chartScheme ?? "default"];
  const sansFont = getFontById(config.fontSans) ?? getDefaultSansFont();
  const monoFont = getFontById(config.fontMono) ?? getDefaultMonoFont();
  const editorFont = getFontById(config.editorFontFamily) ?? getDefaultMonoFont();

  const radius = config.radius;

  // Generate glass CSS if enabled — produces {root, dark} for :root and .dark blocks
  const glassCSS = config.glassEffect
    ? generateGlassCSS({ tier: config.glassIntensity })
    : { root: "", dark: "" };

  // Build :root block
  let css = `/* PrismNext Theme — generated */
:root {
  --radius: ${radius}rem;
  --background: ${lightVars["--background"]};
  --foreground: ${lightVars["--foreground"]};
  --card: ${lightVars["--card"]};
  --card-foreground: ${lightVars["--card-foreground"]};
  --popover: ${lightVars["--popover"]};
  --popover-foreground: ${lightVars["--popover-foreground"]};
  --primary: ${primary.primaryLight};
  --primary-foreground: ${primary.primaryLightForeground};
  --secondary: ${lightVars["--secondary"]};
  --secondary-foreground: ${lightVars["--secondary-foreground"]};
  --muted: ${lightVars["--muted"]};
  --muted-foreground: ${lightVars["--muted-foreground"]};
  --accent: ${lightVars["--accent"]};
  --accent-foreground: ${lightVars["--accent-foreground"]};
  --border: ${lightVars["--border"]};
  --input: ${lightVars["--input"]};
  --ring: ${primary.ringLight};
  --chart-1: ${chart.light[0]};
  --chart-2: ${chart.light[1]};
  --chart-3: ${chart.light[2]};
  --chart-4: ${chart.light[3]};
  --chart-5: ${chart.light[4]};${buildSidebarVars(lightVars, "light")}
  --font-sans: ${sansFont.family};
  --font-mono: ${monoFont.family};
  --font-ui-size: ${resolveFontSize(config.uiFontSize)};
  --font-editor: ${editorFont.family};
  --font-editor-size: ${resolveFontSize(config.editorFontSize)};
  ${generateEditorSyntaxVars(primary, lightVars, "light")}${glassCSS.root}
}

.dark {
  --background: ${darkVars["--background"]};
  --foreground: ${darkVars["--foreground"]};
  --card: ${darkVars["--card"]};
  --card-foreground: ${darkVars["--card-foreground"]};
  --popover: ${darkVars["--popover"]};
  --popover-foreground: ${darkVars["--popover-foreground"]};
  --primary: ${primary.primaryDark};
  --primary-foreground: ${primary.primaryDarkForeground};
  --secondary: ${darkVars["--secondary"]};
  --secondary-foreground: ${darkVars["--secondary-foreground"]};
  --muted: ${darkVars["--muted"]};
  --muted-foreground: ${darkVars["--muted-foreground"]};
  --accent: ${darkVars["--accent"]};
  --accent-foreground: ${darkVars["--accent-foreground"]};
  --border: ${darkVars["--border"]};
  --input: ${darkVars["--input"]};
  --ring: ${primary.ringDark};
  --chart-1: ${chart.dark[0]};
  --chart-2: ${chart.dark[1]};
  --chart-3: ${chart.dark[2]};
  --chart-4: ${chart.dark[3]};
  --chart-5: ${chart.dark[4]};${buildSidebarVars(darkVars, "dark")}
  ${generateEditorSyntaxVars(primary, darkVars, "dark")}${glassCSS.dark}
}`;

  return css;
}

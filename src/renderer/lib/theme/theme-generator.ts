// lib/theme/theme-generator.ts
// Core engine: ThemeConfig -> CSS text string for <style> injection.

import { resolveFontCssFamily } from "./font-options";
import { generateGlassCSS, type GlassTier } from "./glass-system";
import { getThemePack, type ThemeAnchors, type ThemePackId } from "./theme-packs";

export interface ThemeConfig {
  themePack: ThemePackId;
  radius: number;
  fontSans: string;
  fontMono: string;
  uiFontSize: string;
  editorFontFamily: string;
  editorFontSize: string;
  glassEffect: boolean;
  glassIntensity: GlassTier;
}

export function getDefaultThemeConfig(): ThemeConfig {
  return {
    themePack: "academic",
    radius: 0.625,
    fontSans: "system-ui",
    fontMono: "system-mono",
    uiFontSize: "16px",
    editorFontFamily: "system-mono",
    editorFontSize: "13px",
    glassEffect: false,
    glassIntensity: 3 as GlassTier,
  };
}

export function mapAnchorsToCssVars(anchors: ThemeAnchors): Record<string, string> {
  return {
    "--background": anchors.neutral.background,
    "--foreground": anchors.neutral.foreground,
    "--card": anchors.neutral.card,
    "--card-foreground": anchors.neutral.cardForeground,
    "--popover": anchors.neutral.popover,
    "--popover-foreground": anchors.neutral.popoverForeground,
    "--primary": anchors.brand.base,
    "--primary-foreground": anchors.brand.foreground,
    "--secondary": anchors.secondary.base,
    "--secondary-foreground": anchors.secondary.foreground,
    "--muted": anchors.neutral.muted,
    "--muted-foreground": anchors.neutral.mutedForeground,
    "--accent": anchors.accent.base,
    "--accent-foreground": anchors.accent.foreground,
    "--border": anchors.neutral.border,
    "--input": anchors.neutral.input,
    "--ring": anchors.brand.ring,
    "--destructive": anchors.semantic.destructive,
    "--destructive-foreground": anchors.semantic.destructiveForeground,
    "--success": anchors.semantic.success,
    "--success-foreground": anchors.semantic.successForeground,
    "--warning": anchors.semantic.warning,
    "--warning-foreground": anchors.semantic.warningForeground,
    "--sidebar": anchors.neutral.sidebar,
    "--sidebar-foreground": anchors.neutral.sidebarForeground,
    "--sidebar-primary": anchors.brand.base,
    "--sidebar-primary-foreground": anchors.brand.foreground,
    "--sidebar-accent": anchors.neutral.sidebarAccent,
    "--sidebar-accent-foreground": anchors.neutral.sidebarAccentForeground,
    "--sidebar-border": anchors.neutral.sidebarBorder,
    "--sidebar-ring": anchors.neutral.sidebarRing,
  };
}

function resolveFontSize(v: string): string {
  if (v.endsWith("px")) return v;
  const legacy: Record<string, string> = { small: "14px", medium: "16px", large: "18px" };
  return legacy[v] ?? "15px";
}

function generateEditorSyntaxVars(
  brandBase: string,
  vars: Record<string, string>,
  mode: "light" | "dark",
): string {
  const editorBg = vars["--card"];
  const editorFg = vars["--foreground"];
  const editorGutterBg = vars["--muted"];
  const editorGutterFg = vars["--muted-foreground"];
  const editorActiveLine = "color-mix(in oklch, var(--muted) 55%, transparent)";

  const selAlpha = mode === "dark" ? 0.35 : 0.36;
  const selColor = brandBase.includes("/")
    ? brandBase
    : brandBase.replace(")", ` / ${selAlpha})`);

  const L = mode === "dark" ? 0.72 : 0.42;
  const Lcomment = mode === "dark" ? 0.5 : 0.55;

  return `
  /* Editor chrome - card paper on quiet shell; gutter uses muted well */
  --editor-bg: ${editorBg};
  --editor-fg: ${editorFg};
  --editor-gutter-bg: ${editorGutterBg};
  --editor-gutter-fg: ${editorGutterFg};
  --editor-selection: ${selColor};
  --editor-active-line: ${editorActiveLine};
  --editor-cursor: ${brandBase};

  /* PDF reading well - muted stage behind white pages */
  --pdf-canvas: ${vars["--muted"]};

  /* Diff colors - unified across all themes */
  --editor-diff-deleted-bg: ${mode === "dark" ? "rgba(248,81,81,0.18)" : "rgba(239,68,68,0.20)"};
  --editor-diff-inserted-bg: ${mode === "dark" ? "rgba(52,211,110,0.18)" : "rgba(34,197,94,0.20)"};
  --editor-diff-deleted-text: ${mode === "dark" ? "rgba(248,81,81,0.24)" : "rgba(239,68,68,0.22)"};
  --editor-diff-inserted-text: ${mode === "dark" ? "rgba(52,211,110,0.24)" : "rgba(34,197,94,0.22)"};
  --editor-diff-deleted-fg: ${mode === "dark" ? "oklch(0.72 0.17 25)" : "oklch(0.55 0.2 25)"};
  --editor-diff-inserted-fg: ${mode === "dark" ? "oklch(0.78 0.15 145)" : "oklch(0.52 0.16 145)"};

  /* Syntax token colors - prismnext custom theme
     Semantic hues: keyword=brand, string=green, number=amber,
     function=blue, type=teal, regexp=rose, comment=gray */
  --syntax-keyword: ${brandBase};
  --syntax-comment: oklch(${Lcomment} 0.03 270);
  --syntax-string: oklch(${L} 0.14 155);
  --syntax-number: oklch(${L} 0.16 75);
  --syntax-function: oklch(${L} 0.14 250);
  --syntax-type: oklch(${L} 0.14 190);
  --syntax-tag: ${brandBase};
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

function emitModeBlock(vars: Record<string, string>, indent = "  "): string {
  const keys = [
    "--background",
    "--foreground",
    "--card",
    "--card-foreground",
    "--popover",
    "--popover-foreground",
    "--primary",
    "--primary-foreground",
    "--secondary",
    "--secondary-foreground",
    "--muted",
    "--muted-foreground",
    "--accent",
    "--accent-foreground",
    "--border",
    "--input",
    "--ring",
    "--destructive",
    "--destructive-foreground",
    "--success",
    "--success-foreground",
    "--warning",
    "--warning-foreground",
    "--sidebar",
    "--sidebar-foreground",
    "--sidebar-primary",
    "--sidebar-primary-foreground",
    "--sidebar-accent",
    "--sidebar-accent-foreground",
    "--sidebar-border",
    "--sidebar-ring",
  ] as const;

  return keys.map((k) => `${indent}${k}: ${vars[k]};`).join("\n");
}

export function generateThemeCSS(config: ThemeConfig): string {
  const pack = getThemePack(config.themePack);
  const lightAnchors = pack.balanced.light;
  const darkAnchors = pack.balanced.dark;

  const lightVars = mapAnchorsToCssVars(lightAnchors);
  const darkVars = mapAnchorsToCssVars(darkAnchors);

  const chart = pack.chart;
  const sansFamily = resolveFontCssFamily(config.fontSans, "sans");
  const monoFamily = resolveFontCssFamily(config.fontMono, "mono");
  const editorFamily = resolveFontCssFamily(config.editorFontFamily, "mono");

  const glassCSS = config.glassEffect
    ? generateGlassCSS({ tier: config.glassIntensity })
    : { root: "", dark: "" };

  return `/* PrismNext Theme - generated */
:root {
  --radius: ${config.radius}rem;
${emitModeBlock(lightVars)}
  --chart-1: ${chart.light[0]};
  --chart-2: ${chart.light[1]};
  --chart-3: ${chart.light[2]};
  --chart-4: ${chart.light[3]};
  --chart-5: ${chart.light[4]};
  --font-sans: ${sansFamily};
  --font-mono: ${monoFamily};
  --font-ui-size: ${resolveFontSize(config.uiFontSize)};
  --font-editor: ${editorFamily};
  --font-editor-size: ${resolveFontSize(config.editorFontSize)};
  ${generateEditorSyntaxVars(lightAnchors.brand.base, lightVars, "light")}${glassCSS.root}
}

.dark {
${emitModeBlock(darkVars)}
  --chart-1: ${chart.dark[0]};
  --chart-2: ${chart.dark[1]};
  --chart-3: ${chart.dark[2]};
  --chart-4: ${chart.dark[3]};
  --chart-5: ${chart.dark[4]};
  ${generateEditorSyntaxVars(darkAnchors.brand.base, darkVars, "dark")}${glassCSS.dark}
}`;
}

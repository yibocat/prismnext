// lib/theme/chart-palettes.ts
// 5-color chart palette type used by theme packs. Each pack owns its own
// hand-tuned light + dark chart, so the older "default/vivid/pastel/monochrome"
// scheme registry was retired when intensity was removed.

export interface ChartPalette {
  light: [string, string, string, string, string];
  dark: [string, string, string, string, string];
}

/**
 * Agent bash must not rasterize / shrink a figure just so chat can show it.
 * Chat already peeks project PNG/PDF. experiment-run is not this gate.
 */

export function isDisplayRasterBashCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  if (/(?:^|[;&|\n]|&&|\|\|)\s*(?:sudo\s+)?(?:\S*\/)?(?:magick|mogrify)(?=\s|$)/i.test(c)) {
    return true;
  }
  if (
    /(?:^|[;&|\n]|&&|\|\|)\s*(?:sudo\s+)?(?:\S*\/)?convert\s+\S+\.(?:png|jpe?g|webp|gif|pdf|svg)\b/i.test(
      c,
    )
  ) {
    return true;
  }
  if (/\bsips\s+-[zZ]\b/.test(c)) return true;
  if (/\bsips\s+-s\s+format\b/i.test(c)) return true;
  if (/\bpdftoppm\b/i.test(c)) return true;
  if (/\bgs\b[\s\S]*-sDEVICE=(?:png|jpeg|jpg|tiff)/i.test(c)) return true;
  const usesPil = /\b(?:from\s+PIL\b|import\s+PIL\b|from\s+Pillow\b|Image\.open\s*\()/i.test(c);
  const mutates = /\b(?:resize|thumbnail|\.save\s*\()/i.test(c);
  return usesPil && mutates;
}

export function displayRasterBashBlockMessage(): string {
  return (
    "prismnext: do not rasterize or shrink a figure via bash (PIL / ImageMagick / sips) " +
    "just to display it. Chat already previews the project PNG or PDF."
  );
}

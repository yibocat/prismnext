/**
 * Block AI bash from opening image/PDF viewers as a substitute for in-chat
 * markdown embeds (`![…](path)`). Humans see figures in prismnext chat that way.
 */

const IMAGE_OR_PDF_EXT =
  /\.(png|jpe?g|gif|webp|svg|bmp|pdf)(?=$|["'\s\\;|&><])/i;

/** macOS `open`, Linux `xdg-open`, Windows `start` — common viewer launchers. */
const EXTERNAL_OPEN =
  /(?:^|[\n;&|]|&&|\|\|)\s*(?:open(?:\s+-a\s+\S+)?|xdg-open|start)\b/i;

export function isBashExternalImageOpenCommand(command: string): boolean {
  const cmd = (command || "").trim();
  if (!cmd) return false;
  if (!EXTERNAL_OPEN.test(cmd)) return false;
  return IMAGE_OR_PDF_EXT.test(cmd);
}

export function bashExternalImageOpenBlockMessage(): string {
  return (
    "prismnext: do not open image/PDF viewers via bash (`open` / `xdg-open` / `start`) to show figures to the human. " +
    "Embed them in your chat reply with markdown, e.g. `![chart title](project-relative/path.png)`, " +
    "so prismnext renders them inline. Use an external viewer only if the human explicitly asked to open the file outside chat."
  );
}

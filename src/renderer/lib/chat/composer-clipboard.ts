import type { ComposerPart } from "@/lib/chat/composer-parts";
import { mergeAdjacentText, partsToPlainText } from "@/lib/chat/composer-parts";
import { draftToJson, parseDraftJson } from "@/components/modules/chat/inline-composer/serialize";

/** Structured clipboard payload — round-trip paste inside PrismNext composer. */
export const COMPOSER_CLIPBOARD_MIME = "application/vnd.prismnext.composer+json";

export function writeComposerPartsToClipboard(
  data: DataTransfer,
  parts: ComposerPart[],
): void {
  const merged = mergeAdjacentText(parts);
  if (merged.length === 0) return;
  data.setData("text/plain", partsToPlainText(merged));
  data.setData(COMPOSER_CLIPBOARD_MIME, draftToJson(merged));
}

export function readComposerPartsFromClipboard(
  data: DataTransfer,
): ComposerPart[] | null {
  const raw = data.getData(COMPOSER_CLIPBOARD_MIME);
  if (!raw) return null;
  try {
    const parts = parseDraftJson(raw);
    if (parts.length === 0) return null;
    if (parts.length === 1 && parts[0].type === "text" && parts[0].text === "") {
      return null;
    }
    return parts;
  } catch {
    return null;
  }
}

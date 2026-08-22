import { normalizeCslPageRange } from "./helpers";

export function pickCrossrefVenue(msg: {
  "container-title"?: string[];
  "short-container-title"?: string[];
  container?: string[];
  event?: { name?: string };
  publisher?: string;
}): string | null {
  return (
    msg["container-title"]?.[0]?.trim() ||
    msg["short-container-title"]?.[0]?.trim() ||
    msg.container?.[0]?.trim() ||
    msg.event?.name?.trim() ||
    msg.publisher?.trim() ||
    null
  );
}

export function pickCrossrefPage(msg: {
  page?: string;
  "article-number"?: string;
}): string | null {
  const raw = msg.page?.trim() || msg["article-number"]?.trim();
  return raw ? normalizeCslPageRange(raw) : null;
}

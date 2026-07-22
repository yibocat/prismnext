/** Relative time labels for chat turn footers (ms epoch). */
import { i18n } from "@/lib/i18n";

export function formatRelativeTimeMs(ts: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 45) return i18n.t("chat.turnFooter.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return i18n.t("chat.turnFooter.minutesAgo", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return i18n.t("chat.turnFooter.hoursAgo", { count: hr });
  const day = Math.floor(hr / 24);
  return i18n.t("chat.turnFooter.daysAgo", { count: day });
}

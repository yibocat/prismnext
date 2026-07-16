/** Translate known default chat titles at display time (stored titles stay English). */
export function displayChatTitle(
  title: string | null | undefined,
  t: (key: string) => string,
  fallbackKey = "chat.tab.chat",
): string {
  const raw = (title ?? "").trim();
  if (!raw || raw === "New Chat" || raw === "New session" || raw === "New Session") {
    return t("chat.tab.newChat");
  }
  if (raw === "Chat") return t(fallbackKey);
  return raw;
}

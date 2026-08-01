import { useMemo } from "react";
import { CHAT_HOME_BACKDROP_COMPONENTS } from "@/lib/chat/home-backdrops/registry";
import { resolveChatHomeBackdrop } from "@/lib/chat/home-backdrops/resolve";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";

/** Chat backdrop — homepage and active sessions (settings-controlled). */
export function ChatHomeBackdrop() {
  const enabled = useSettingsStore((s) => s.settings.chatHomeBackdropEnabled);
  const setting = useSettingsStore((s) => s.settings.chatHomeBackdrop);
  const themePack = useThemeStore((s) => s.config.themePack);

  const style = useMemo(
    () => resolveChatHomeBackdrop(setting, enabled, themePack),
    [setting, enabled, themePack],
  );

  if (!style) return null;

  const Backdrop = CHAT_HOME_BACKDROP_COMPONENTS[style];
  return <Backdrop />;
}

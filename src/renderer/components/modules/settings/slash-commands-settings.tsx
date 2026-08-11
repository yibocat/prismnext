import CommandsSettings from "./commands-settings";
import type { AgentAssetPaneProps } from "./agent-assets-shared";

/** Legacy entry; Commands live under Settings → Teams hub tabs. */
export function SlashCommandsSettings(props: AgentAssetPaneProps = {}) {
  return <CommandsSettings {...props} />;
}

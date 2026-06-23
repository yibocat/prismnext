import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { Terminal as TerminalIcon } from "lucide-react";
import { TerminalSidebar } from "./terminal-sidebar";
import { TerminalToolbar } from "./terminal-toolbar";
import { TerminalContent } from "./terminal-content";

function TerminalToolbarWrapper({ tab }: { tab: RightTab }) {
  return (
    <TerminalToolbar
      tabId={tab.id}
      tabTitle={tab.title}
      isAi={tab.terminalSource === "ai"}
      linkedChatTabId={tab.linkedChatTabId}
    />
  );
}

export const terminalMode: ModeDefinition = {
  id: "terminal",
  label: "Terminal",
  icon: <TerminalIcon className="size-3.5" />,
  tabKinds: ["terminal"],
  persistence: "transient",
  initialTitle: "Shell",
  Sidebar: TerminalSidebar,
  Toolbar: TerminalToolbarWrapper,
  Content: TerminalContent,
};

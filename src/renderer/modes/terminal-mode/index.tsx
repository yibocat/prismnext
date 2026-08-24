import { isJobMonitorTab, type ModeDefinition, type RightTab } from "@/lib/workspace/mode-registry";
import { Terminal as TerminalIcon } from "lucide-react";
import { TerminalSidebar } from "./terminal-sidebar";
import { TerminalToolbar } from "./terminal-toolbar";
import { TerminalContent } from "./terminal-content";

function TerminalToolbarWrapper({ tab }: { tab: RightTab }) {
  return (
    <TerminalToolbar
      tabId={tab.id}
      tabTitle={tab.title}
      isAi={isJobMonitorTab(tab)}
      linkedChatTabId={tab.kind === "terminal" ? tab.linkedChatTabId : undefined}
      linkedExecutionId={tab.kind === "terminal" ? tab.linkedExecutionId : undefined}
    />
  );
}

export const terminalMode: ModeDefinition = {
  id: "terminal",
  label: "Terminal",
  labelKey: "modes.terminal.label",
  icon: <TerminalIcon className="size-3.5" />,
  tabKinds: ["terminal"],
  addMenuPolicy: "multi",
  initialTitle: "Shell",
  initialTitleKey: "modes.terminal.initialTitle",
  Sidebar: TerminalSidebar,
  Toolbar: TerminalToolbarWrapper,
  Content: TerminalContent,
};

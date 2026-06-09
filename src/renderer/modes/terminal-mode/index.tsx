import type { ModeDefinition, RightTab } from "@/lib/mode-registry";
import { Terminal as TerminalIcon } from "lucide-react";
import { TerminalSidebar } from "./terminal-sidebar";
import { TerminalToolbar } from "./terminal-toolbar";
import { TerminalContent } from "./terminal-content";

function TerminalToolbarWrapper({ tab }: { tab: RightTab }) {
  return <TerminalToolbar tabId={tab.id} tabTitle={tab.title} />;
}

export const terminalMode: ModeDefinition = {
  id: "terminal",
  label: "Terminal",
  icon: <TerminalIcon className="size-3.5" />,
  tabKinds: ["terminal"],
  persistence: "transient",
  initialTitle: "Terminal",
  Sidebar: TerminalSidebar,
  Toolbar: TerminalToolbarWrapper,
  Content: TerminalContent,
};

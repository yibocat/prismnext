import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { GlobeIcon } from "lucide-react";
import { BrowserSidebar } from "./browser-sidebar";
import { BrowserToolbar } from "./browser-toolbar";
import { BrowserContent } from "./browser-content";

function BrowserToolbarWrapper({ tab }: { tab: RightTab }) {
  return (
    <BrowserToolbar
      tabId={tab.id}
      tabUrl={tab.url ?? ""}
      tabTitle={tab.title}
    />
  );
}

export const browserMode: ModeDefinition = {
  id: "browser",
  label: "Browser",
  icon: <GlobeIcon className="size-3.5" />,
  tabKinds: ["browser"],
  persistence: "persistent",
  initialTitle: "Browser",
  Sidebar: BrowserSidebar,
  Toolbar: BrowserToolbarWrapper,
  Content: BrowserContent,
};

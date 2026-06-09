import type { ModeDefinition } from "@/lib/mode-registry";
import { FileType } from "lucide-react";
import { TexworkspaceSidebar } from "./texworkspace-sidebar";
import { TexworkspaceContent, TexworkspaceToolbarWrapper } from "./texworkspace-content";

export const texworkspaceMode: ModeDefinition = {
  id: "texworkspace",
  label: "Texworkspace",
  icon: <FileType className="size-3.5" />,
  tabKinds: ["texworkspace"],
  persistence: "transient",
  initialTitle: "Texworkspace",
  Sidebar: TexworkspaceSidebar,
  Toolbar: TexworkspaceToolbarWrapper,
  Content: TexworkspaceContent,
};

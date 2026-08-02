import type { ModeDefinition } from "@/lib/workspace/mode-registry";
import { FileType } from "lucide-react";
import { TexworkspaceSidebar } from "./texworkspace-sidebar";
import { TexworkspaceContent, TexworkspaceToolbarWrapper } from "./texworkspace-content";

export const texworkspaceMode: ModeDefinition = {
  id: "texworkspace",
  label: "TeX Workspace",
  labelKey: "modes.texworkspace.label",
  icon: <FileType className="size-3.5" />,
  tabKinds: ["texworkspace"],
  initialTitle: "TeX Workspace",
  initialTitleKey: "modes.texworkspace.initialTitle",
  Sidebar: TexworkspaceSidebar,
  Toolbar: TexworkspaceToolbarWrapper,
  Content: TexworkspaceContent,
};

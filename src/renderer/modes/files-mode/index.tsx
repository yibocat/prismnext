import type { ModeDefinition, RightTab } from "@/lib/mode-registry";
import { Folders as FilesIcon } from "lucide-react";
import { FilesSidebar } from "./files-sidebar";
import { FileToolbar } from "./files-toolbar";
import { FilesContent } from "./files-content";

export const filesMode: ModeDefinition = {
  id: "files",
  label: "Files",
  icon: <FilesIcon className="size-3.5" />,
  tabKinds: ["file"],
  persistence: "persistent",
  initialTitle: "Files",
  Sidebar: FilesSidebar,
  Toolbar: ({ tab }: { tab: RightTab }) => <FileToolbar filePath={tab.filePath} />,
  Content: FilesContent,
};

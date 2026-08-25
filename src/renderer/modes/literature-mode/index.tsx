import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { BookOpenIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { shouldRefreshLiteratureOnActivate, useLiteratureStore } from "@/stores/literature-store";
import { LiteratureSidebar } from "./literature-sidebar";
import { LiteratureToolbar } from "./literature-toolbar";
import { LiteratureContent } from "./literature-content";

function LiteratureToolbarWrapper({ tab }: { tab: RightTab }) {
  return <LiteratureToolbar tab={tab} />;
}

export const literatureMode: ModeDefinition = {
  id: "literature",
  label: "Literature",
  labelKey: "modes.literature.label",
  icon: <BookOpenIcon className="size-3.5" />,
  tabKinds: ["literature"],
  surface: "workspace",
  /** 「+」始终可再开一个 Library 首页；开论文时由 openLiteraturePaper 替换当前首页。 */
  addMenuPolicy: "multi",
  initialTitle: "Library",
  initialTitleKey: "modes.literature.initialTitle",
  Sidebar: LiteratureSidebar,
  Toolbar: LiteratureToolbarWrapper,
  Content: LiteratureContent,
  onActivate: () => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot) return;
    const { bootstrappedRoot, refresh } = useLiteratureStore.getState();
    // First paint is owned by LiteratureContent.bootstrapLiterature.
    if (!shouldRefreshLiteratureOnActivate(bootstrappedRoot, projectRoot)) return;
    void refresh(projectRoot);
  },
};

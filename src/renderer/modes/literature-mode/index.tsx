import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { BookOpenIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { LiteratureSidebar } from "./literature-sidebar";
import { LiteratureToolbar } from "./literature-toolbar";
import { LiteratureContent } from "./literature-content";

function LiteratureToolbarWrapper({ tab }: { tab: RightTab }) {
  return <LiteratureToolbar tab={tab} />;
}

export const literatureMode: ModeDefinition = {
  id: "literature",
  label: "Literature",
  icon: <BookOpenIcon className="size-3.5" />,
  tabKinds: ["literature"],
  surface: "any",
  persistence: "persistent",
  initialTitle: "Library",
  Sidebar: LiteratureSidebar,
  Toolbar: LiteratureToolbarWrapper,
  Content: LiteratureContent,
  onActivate: () => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot) return;
    // LiteratureContent.bootstrapLiterature handles bound-project Zotero sync;
    // only refresh local list when activating without a bound collection loaded yet.
    const { boundCollectionId, zoteroAutoPullDoneForRoot } = useLiteratureStore.getState();
    if (!boundCollectionId || zoteroAutoPullDoneForRoot === projectRoot) {
      void useLiteratureStore.getState().refresh(projectRoot);
    }
  },
};
